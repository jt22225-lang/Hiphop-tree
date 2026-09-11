const fs = require('fs');
const path = require('path');
const https = require('https');

const GRAPH_FILE = path.join(__dirname, 'graph.json');
const DELAY_MS = 5000; // 5 second delay between API calls (very conservative rate limiting)

// Track changes
const results = {
  fixed: [],
  unresolved: [],
  noWikipediaUrl: [],
  totalChecked: 0
};

// Utility: sleep for specified ms
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch Wikidata ID from Wikipedia API
async function getWikidataIdFromWikipedia(wikipediaUrl) {
  return new Promise((resolve, reject) => {
    // Extract page title from URL
    // Format: https://en.wikipedia.org/wiki/Page_Title
    const match = wikipediaUrl.match(/\/wiki\/([^?#]+)$/);
    if (!match) {
      reject(new Error(`Invalid Wikipedia URL: ${wikipediaUrl}`));
      return;
    }

    const pageTitle = decodeURIComponent(match[1]);

    const apiUrl = new URL('https://en.wikipedia.org/w/api.php');
    apiUrl.searchParams.append('action', 'query');
    apiUrl.searchParams.append('titles', pageTitle);
    apiUrl.searchParams.append('prop', 'pageprops');
    apiUrl.searchParams.append('format', 'json');
    apiUrl.searchParams.append('origin', '*');

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HipHopTreeBot/1.0)'
      }
    };

    https.get(apiUrl.toString(), options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Check for rate limiting or errors
        if (res.statusCode === 429) {
          reject(new Error('Rate limited by Wikipedia API'));
          return;
        }

        if (res.statusCode >= 500) {
          reject(new Error(`Wikipedia API error ${res.statusCode}`));
          return;
        }

        try {
          const json = JSON.parse(data);
          const pages = json.query?.pages || {};

          // Get the first (usually only) page result
          const pageData = Object.values(pages)[0];

          if (!pageData) {
            reject(new Error('No page found'));
            return;
          }

          if (pageData.missing) {
            reject(new Error('Page does not exist'));
            return;
          }

          const wikidataId = pageData.pageprops?.wikibase_item;
          if (!wikidataId) {
            reject(new Error('No Wikidata item linked'));
            return;
          }

          resolve(wikidataId);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  // Read graph.json
  let graphData;
  try {
    const rawData = fs.readFileSync(GRAPH_FILE, 'utf8');
    graphData = JSON.parse(rawData);
  } catch (err) {
    console.error(`❌ Failed to read graph.json: ${err.message}`);
    process.exit(1);
  }

  // Validate artists array exists
  if (!Array.isArray(graphData.artists)) {
    console.error('❌ Error: graph.json does not contain a top-level "artists" array');
    process.exit(1);
  }

  console.log(`📊 Auditing ${graphData.artists.length} artists for Wikidata ID correctness...\n`);

  // Process each artist
  for (let i = 0; i < graphData.artists.length; i++) {
    const artist = graphData.artists[i];
    results.totalChecked++;

    // Check for Wikipedia URL
    const wikipediaUrl = artist.metadata?.wikipediaUrl;
    if (!wikipediaUrl) {
      results.noWikipediaUrl.push(artist.name);
      console.log(`⚠️  ${artist.name}: no Wikipedia URL — needs manual research`);
      continue;
    }

    // Add polite delay before API call (except first one)
    if (i > 0) {
      await sleep(DELAY_MS);
    }

    try {
      const correctWikidataId = await getWikidataIdFromWikipedia(wikipediaUrl);
      const currentWikidataId = artist.metadata?.wikidataId;

      if (currentWikidataId !== correctWikidataId) {
        const oldId = currentWikidataId || '(none)';
        console.log(`✅ ${artist.name}: ${oldId} -> ${correctWikidataId}`);

        // Update the Wikidata ID
        if (!artist.metadata) {
          artist.metadata = {};
        }
        artist.metadata.wikidataId = correctWikidataId;

        results.fixed.push({
          name: artist.name,
          oldId: currentWikidataId,
          newId: correctWikidataId
        });
      } else {
        console.log(`✓  ${artist.name}: ${currentWikidataId} (correct)`);
      }
    } catch (err) {
      results.unresolved.push(artist.name);
      console.log(`❌ ${artist.name}: unresolved — ${err.message}`);
    }
  }

  // Write corrected data back to graph.json
  console.log('\n💾 Writing corrected data to graph.json...');
  try {
    fs.writeFileSync(
      GRAPH_FILE,
      JSON.stringify(graphData, null, 2) + '\n',
      'utf8'
    );
    console.log('✓  graph.json updated');
  } catch (err) {
    console.error(`❌ Failed to write graph.json: ${err.message}`);
    process.exit(1);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total artists checked:     ${results.totalChecked}`);
  console.log(`✅ Fixed:                   ${results.fixed.length}`);
  console.log(`❌ Unresolved:              ${results.unresolved.length}`);
  console.log(`⚠️  No Wikipedia URL:        ${results.noWikipediaUrl.length}`);

  if (results.fixed.length > 0) {
    console.log('\n📝 FIXED WIKIDATA IDS:');
    results.fixed.forEach(item => {
      console.log(`   ${item.name}: ${item.oldId} → ${item.newId}`);
    });
  }

  if (results.unresolved.length > 0) {
    console.log('\n⚠️  UNRESOLVED (may genuinely lack usable photo):');
    results.unresolved.forEach(name => {
      console.log(`   ${name}`);
    });
  }

  if (results.noWikipediaUrl.length > 0) {
    console.log('\n📋 NO WIKIPEDIA URL (needs manual research):');
    results.noWikipediaUrl.forEach(name => {
      console.log(`   ${name}`);
    });
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
