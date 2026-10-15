#!/usr/bin/env node

const https = require('https');
const graphData = require('../graph.json');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    https.get(urlObj, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', reject);
  });
}

async function auditWikipedia() {
  console.log('🔍 Auditing Wikipedia metadata for all artists...\n');

  // Get all artists with stored wikipediaUrl
  const artistsWithWiki = graphData.artists.filter(a => a.metadata?.wikipediaUrl);
  console.log(`Total artists with metadata.wikipediaUrl: ${artistsWithWiki.length}\n`);

  const issues = [];

  // Process in batches of 50 titles per request (Wikipedia API limit)
  for (let i = 0; i < artistsWithWiki.length; i += 50) {
    const batch = artistsWithWiki.slice(i, i + 50);

    // Extract page titles from URLs
    const titles = batch
      .map(a => {
        const match = a.metadata.wikipediaUrl.match(/\/wiki\/(.+)$/);
        return match ? decodeURIComponent(match[1]) : null;
      })
      .filter(Boolean);

    if (titles.length === 0) continue;

    console.log(`Checking batch ${Math.floor(i / 50) + 1} (${titles.length} pages)...`);

    // Query Wikipedia API with redirects
    const titlesParam = titles.join('|');
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titlesParam)}&prop=pageprops&redirects=1&format=json`;

    const data = await fetchJson(url);

    if (!data?.query?.pages) {
      console.error('Failed to fetch Wikipedia data for batch');
      continue;
    }

    // Check each page
    for (let j = 0; j < batch.length; j++) {
      const artist = batch[j];
      const urlMatch = artist.metadata.wikipediaUrl.match(/\/wiki\/(.+)$/);
      const pageTitle = urlMatch ? decodeURIComponent(urlMatch[1]) : null;

      // Find page in results
      const page = Object.values(data.query.pages).find(p => p.title === pageTitle || p.redirect?.to === pageTitle);

      if (!page) {
        issues.push(`${artist.id}: Page not found in batch results`);
        continue;
      }

      // Check for missing page
      if (page.missing) {
        issues.push(`${artist.id} (${artist.name}): Wikipedia page missing - URL: ${artist.metadata.wikipediaUrl}`);
        continue;
      }

      // Check for disambiguation page
      if (page.pageprops?.disambiguation) {
        issues.push(`${artist.id} (${artist.name}): Page is disambiguation - URL: ${artist.metadata.wikipediaUrl}`);
      }

      // Check for redirect
      if (page.redirect) {
        issues.push(`${artist.id} (${artist.name}): Page redirects to "${page.redirect.to}" - URL: ${artist.metadata.wikipediaUrl}`);
      }

      // Check wikibase_item mismatch
      const storedWikidataId = artist.metadata?.wikidataId;
      const actualWikidataId = page.pageprops?.wikibase_item;

      if (storedWikidataId && actualWikidataId && storedWikidataId !== actualWikidataId) {
        issues.push(`${artist.id} (${artist.name}): Wikidata ID mismatch - stored: ${storedWikidataId}, actual: ${actualWikidataId}`);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + 50 < artistsWithWiki.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Report results
  if (issues.length === 0) {
    console.log('\n✅ All Wikipedia metadata is valid!');
  } else {
    console.log(`\n⚠️  Found ${issues.length} issue(s):\n`);
    issues.forEach(issue => console.log(`  ${issue}`));
  }

  process.exit(issues.length > 0 ? 1 : 0);
}

auditWikipedia().catch(err => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
