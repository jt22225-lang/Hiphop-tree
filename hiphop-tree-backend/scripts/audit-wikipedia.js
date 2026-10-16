#!/usr/bin/env node

const https = require('https');
const path = require('path');
const fs = require('fs');

// Allow optional file path argument for testing
const graphPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '../graph.json');
const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      headers: {
        'User-Agent': 'HipHopTree-audit/1.0 (https://hiphoptree.com)'
      }
    };
    https.get(urlObj, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Handle rate limiting with Retry-After
        if (res.statusCode === 429) {
          const retryAfter = res.headers['retry-after'];
          console.warn(`[RATE LIMITED] Status 429, Retry-After: ${retryAfter || 'not specified'}`);
          resolve(null);
          return;
        }

        if (res.statusCode !== 200) {
          console.error(`[ERROR] Status ${res.statusCode}: ${data.substring(0, 200)}`);
          resolve(null);
          return;
        }

        try {
          resolve(JSON.parse(data));
        } catch (e) {
          console.error(`[PARSE ERROR] ${e.message}`);
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

    // Extract page titles from URLs (decoded)
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

    // Build a map of input titles to pages using normalized and redirects
    const normalized = {};
    const redirects = {};

    if (data.query.normalized) {
      data.query.normalized.forEach(n => {
        normalized[n.from] = n.to;
      });
    }

    if (data.query.redirects) {
      data.query.redirects.forEach(r => {
        redirects[r.from] = r.to;
      });
    }

    // Check each artist in batch
    for (const artist of batch) {
      const urlMatch = artist.metadata.wikipediaUrl.match(/\/wiki\/(.+)$/);
      const decodedTitle = urlMatch ? decodeURIComponent(urlMatch[1]) : null;

      if (!decodedTitle) continue;

      // Map the title through normalization and redirects
      let actualTitle = decodedTitle;
      if (normalized[actualTitle]) {
        actualTitle = normalized[actualTitle];
      }
      if (redirects[decodedTitle]) {
        actualTitle = redirects[decodedTitle];
      }

      // Find page using the mapped title
      const pages = data.query.pages;
      let page = null;

      for (const p of Object.values(pages)) {
        if (p.title === actualTitle && !p.missing) {
          page = p;
          break;
        }
      }

      // If not found, check for redirect targets
      if (!page) {
        for (const p of Object.values(pages)) {
          if (p.redirect && p.redirect.to === actualTitle) {
            page = p;
            break;
          }
        }
      }

      if (!page) {
        issues.push(`${artist.id} (${artist.name}): Page mapping failed - stored title: "${decodedTitle}"`);
        continue;
      }

      // Check for missing page
      if (page.missing) {
        issues.push(`${artist.id} (${artist.name}): Wikipedia page missing - URL: ${artist.metadata.wikipediaUrl}`);
        continue;
      }

      // Check for disambiguation page on FINAL page (after redirects)
      if ('disambiguation' in (page.pageprops || {})) {
        issues.push(`${artist.id} (${artist.name}): disambiguation - final page: "${page.title}"`);
        continue;
      }

      // Check for redirect
      if (page.redirect) {
        issues.push(`${artist.id} (${artist.name}): Page redirects to "${page.redirect.to}" - URL: ${artist.metadata.wikipediaUrl}`);
      }

      // Check wikibase_item mismatch (only if artist has a stored ID)
      const storedWikidataId = artist.metadata?.wikidataId;
      const actualWikidataId = page.pageprops?.wikibase_item;

      if (storedWikidataId && actualWikidataId && storedWikidataId !== actualWikidataId) {
        issues.push(`${artist.id} (${artist.name}): Wikidata ID mismatch - stored: ${storedWikidataId}, actual: ${actualWikidataId}`);
      }

      if (storedWikidataId && !actualWikidataId) {
        issues.push(`${artist.id} (${artist.name}): stored wikidataId ${storedWikidataId} but Wikipedia page has no wikibase_item`);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + 50 < artistsWithWiki.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const artistsWithWikidata = graphData.artists.filter(a => a.metadata?.wikidataId);
  const DESCRIPTION_KEYWORDS = /\b(rapper|singer|musician|producer|DJ|group|duo|label|record|executive|songwriter|band|collective|recording artist|hip[- ]hop|musical artist|production team)s?\b/i;
  // Reviewed: Cash Money co-founder whose Wikidata description says "businessman"
  const REVIEWED_DESCRIPTION_EXCEPTIONS = new Set(['slim-williams']);
  const PERSON_ROLES = new Set(['rapper', 'producer', 'executive']);
  const ORGANISATION_DESCRIPTION = /record label|company|group/i;

  for (let i = 0; i < artistsWithWikidata.length; i += 50) {
    const batch = artistsWithWikidata.slice(i, i + 50);
    const ids = batch.map(a => a.metadata.wikidataId).join('|');
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=labels|descriptions&languages=en&format=json`;
    const data = await fetchJson(url);

    if (!data?.entities) {
      issues.push(`Wikidata wbgetentities failed for batch starting at ${batch[0].id}`);
      continue;
    }

    for (const artist of batch) {
      const id = artist.metadata.wikidataId;
      const entity = data.entities[id];

      if (!entity || entity.missing !== undefined) {
        issues.push(`${artist.id} (${artist.name}): wikidataId ${id} does not exist on Wikidata`);
        continue;
      }

      const description = entity.descriptions?.en?.value || '';
      if (PERSON_ROLES.has(artist.role) && ORGANISATION_DESCRIPTION.test(description)) {
        issues.push(`${artist.id} (${artist.name}, role ${artist.role}): wikidataId ${id} describes an organisation: "${description}"`);
      }
      if (!DESCRIPTION_KEYWORDS.test(description) && !REVIEWED_DESCRIPTION_EXCEPTIONS.has(artist.id)) {
        issues.push(`${artist.id} (${artist.name}): wikidataId ${id} ("${entity.labels?.en?.value || 'no label'}") description has no music keyword: "${description || 'none'}"`);
      }
    }

    if (i + 50 < artistsWithWikidata.length) {
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
