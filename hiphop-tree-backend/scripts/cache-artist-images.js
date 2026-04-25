/**
 * Pre-fills the Supabase image cache for every artist in graph.json.
 * Run once (or periodically) to avoid cold-start latency on the frontend.
 *
 *   node scripts/cache-artist-images.js
 *   # or via npm:
 *   npm run cache-artist-images
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const graphData   = require('../graph.json');
const { getCached, setCached } = require('../cache');
const { fetchWikiImage }       = require('../lib/image-resolver');

const CONCURRENCY = 3;   // parallel artists per batch
const DELAY_MS    = 250; // ms between batches (polite rate-limiting)

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function processArtist(artist) {
  const nameKey = artist.name.toLowerCase();
  const cached  = await getCached(nameKey);

  if (cached?.image_url) {
    process.stdout.write('·');
    return 'cached';
  }

  const img = await fetchWikiImage(artist.name, artist.metadata?.wikidataId || null);

  if (img) {
    await setCached(nameKey, artist.name, { image_url: img });
    process.stdout.write('✓');
    return 'fetched';
  }

  process.stdout.write('✗');
  return 'not_found';
}

async function main() {
  const artists = graphData.artists;
  console.log(`\n🎤 Caching artist images — ${artists.length} artists (concurrency ${CONCURRENCY})\n`);

  const counts = { cached: 0, fetched: 0, not_found: 0, errors: 0 };

  for (let i = 0; i < artists.length; i += CONCURRENCY) {
    const batch = artists.slice(i, i + CONCURRENCY);

    const statuses = await Promise.all(
      batch.map(a =>
        processArtist(a).catch(err => {
          console.error(`\n[ERROR] ${a.id}: ${err.message}`);
          process.stdout.write('E');
          return 'error';
        })
      )
    );

    statuses.forEach(s => { counts[s] = (counts[s] || 0) + 1; });

    if (i + CONCURRENCY < artists.length) await sleep(DELAY_MS);
  }

  console.log('\n');
  console.log('📊 Results:');
  console.log(`   Already cached : ${counts.cached}`);
  console.log(`   Newly fetched  : ${counts.fetched}`);
  console.log(`   Not found      : ${counts.not_found}`);
  if (counts.errors) console.log(`   Errors         : ${counts.errors}`);
  console.log();
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
