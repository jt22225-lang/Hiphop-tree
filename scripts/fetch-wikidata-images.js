/**
 * fetch-wikidata-images.js — Wikidata P18 Bulk Image Resolver
 *
 * Scans graph.json for every artist that has a wikidataId (either in
 * metadata.wikidataId or top-level wikidataId), then queries the
 * Wikidata API for the P18 (image) claim to get a Wikimedia Commons URL.
 *
 * Falls back to the Wikipedia pageimages API (by artist name) when no
 * Wikidata ID is present — cast a wide net.
 *
 * Writes results to: wikidata-image-cache.json
 * (The Express backend can serve this cache as a static JSON endpoint,
 * or you can import it directly into the frontend.)
 *
 * Usage:
 *   node scripts/fetch-wikidata-images.js
 *   node scripts/fetch-wikidata-images.js --dry-run      # preview only, no writes
 *   node scripts/fetch-wikidata-images.js --force        # re-fetch even cached entries
 *
 * Rate limiting: 1 request per 300ms (Wikimedia asks for ≤ 200 req/s,
 * we stay well clear at ~3/s to be a good citizen).
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ── Config ────────────────────────────────────────────────────
const GRAPH_PATH = path.join(__dirname, '../graph.json');
const CACHE_PATH = path.join(__dirname, '../wikidata-image-cache.json');
const DRY_RUN    = process.argv.includes('--dry-run');
const FORCE      = process.argv.includes('--force');
const DELAY_MS   = 320; // ms between requests — polite rate limiting

// ── Colours for terminal output ───────────────────────────────
const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
};

const log  = (msg)        => console.log(`  ${msg}`);
const ok   = (id, src)    => console.log(`  ${C.green}✓${C.reset} ${id.padEnd(28)} ${C.dim}${src}${C.reset}`);
const miss = (id, reason) => console.log(`  ${C.yellow}–${C.reset} ${id.padEnd(28)} ${C.dim}${reason}${C.reset}`);
const err  = (id, e)      => console.log(`  ${C.red}✗${C.reset} ${id.padEnd(28)} ${C.red}${e}${C.reset}`);

// ── HTTP helper ───────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'HipHopTree/1.0 (https://github.com/jt22225-lang/Hiphop-tree; image-fetcher-bot)',
        'Accept':     'application/json',
      },
      timeout: 8000,
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Strategy 1: Wikidata P18 claim ───────────────────────────
// Converts a Wikidata entity ID (e.g. "Q456097") to a
// Wikimedia Commons Special:FilePath URL.
async function fetchP18Image(wikidataId) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${wikidataId}&property=P18&format=json`;
  const data = await fetchJson(url);
  const claims = data?.claims?.P18;
  if (!claims || !claims.length) return null;
  const filename = claims[0]?.mainsnak?.datavalue?.value;
  if (!filename) return null;
  // Build the Commons FilePath redirect URL (serves the actual image)
  const encoded = encodeURIComponent(filename.replace(/ /g, '_'));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=400`;
}

// ── Strategy 2: Wikipedia pageimages API ─────────────────────
// Good for artists whose Wikidata entry exists but has no P18.
async function fetchWikipediaThumb(artistName) {
  const encoded = encodeURIComponent(artistName);
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=pageimages&format=json&pithumbsize=400`;
  const data = await fetchJson(url);
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  return page?.thumbnail?.source || null;
}

// ── Strategy 3: Wikidata entity search by name ───────────────
// Last resort — search Wikidata for the artist by name and grab
// the first result's P18 image. More error-prone but catches
// artists without a known wikidataId.
async function fetchWikidataByName(artistName) {
  const encoded = encodeURIComponent(artistName);
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encoded}&language=en&type=item&format=json&limit=3`;
  const data = await fetchJson(url);
  const results = data?.search;
  if (!results || !results.length) return null;

  // Try the first 3 results (avoid wrong person)
  for (const result of results.slice(0, 3)) {
    const img = await fetchP18Image(result.id);
    if (img) return img;
    await sleep(DELAY_MS);
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}HipHopTree — Wikidata Image Bulletproofer${C.reset}`);
  console.log(`${C.dim}Graph: ${GRAPH_PATH}${C.reset}`);
  if (DRY_RUN) console.log(`${C.yellow}DRY RUN — no files will be written${C.reset}`);
  console.log('');

  // Load graph
  const graph  = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  const artists = graph.artists;

  // Load existing cache (don't overwrite already-resolved entries unless --force)
  let cache = {};
  if (fs.existsSync(CACHE_PATH) && !FORCE) {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    log(`Loaded ${Object.keys(cache).length} cached entries`);
  }

  let resolved = 0;
  let skipped  = 0;
  let failed   = 0;

  for (const artist of artists) {
    const id          = artist.id;
    const name        = artist.name;
    const wikidataId  = artist.metadata?.wikidataId || artist.wikidataId || null;

    // Skip if already cached (unless --force)
    if (cache[id] && !FORCE) {
      skipped++;
      continue;
    }

    let imageUrl = null;
    let source   = '';

    try {
      // Strategy 1: direct P18 lookup via Wikidata ID
      if (wikidataId) {
        imageUrl = await fetchP18Image(wikidataId);
        if (imageUrl) source = `P18 (${wikidataId})`;
        await sleep(DELAY_MS);
      }

      // Strategy 2: Wikipedia pageimages by name
      if (!imageUrl) {
        imageUrl = await fetchWikipediaThumb(name);
        if (imageUrl) source = 'Wikipedia pageimages';
        await sleep(DELAY_MS);
      }

      // Strategy 3: Wikidata name search
      if (!imageUrl) {
        imageUrl = await fetchWikidataByName(name);
        if (imageUrl) source = 'Wikidata name search';
        await sleep(DELAY_MS);
      }

      if (imageUrl) {
        cache[id] = { url: imageUrl, source, resolvedAt: new Date().toISOString() };
        ok(id, source);
        resolved++;
      } else {
        cache[id] = { url: null, source: 'not_found', resolvedAt: new Date().toISOString() };
        miss(id, 'no image found');
        failed++;
      }
    } catch (e) {
      err(id, e.message);
      failed++;
      cache[id] = { url: null, source: 'error', error: e.message, resolvedAt: new Date().toISOString() };
      await sleep(DELAY_MS * 2); // back off on errors
    }
  }

  // ── Write cache ───────────────────────────────────────────
  if (!DRY_RUN) {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    log(`\n${C.green}Cache written → ${CACHE_PATH}${C.reset}`);
  }

  console.log('');
  console.log(`${C.bold}Summary:${C.reset}`);
  console.log(`  ${C.green}✓ Resolved:${C.reset} ${resolved}`);
  console.log(`  ${C.dim}– Skipped (cached):${C.reset} ${skipped}`);
  console.log(`  ${C.yellow}✗ Not found:${C.reset} ${failed}`);
  console.log(`  Total artists: ${artists.length}`);

  // ── Tip: how to use the cache in the backend ──────────────
  console.log(`\n${C.dim}To serve the cache as an API endpoint, add to server.js:${C.reset}`);
  console.log(`${C.dim}  const imageCache = require('./wikidata-image-cache.json');`);
  console.log(`  app.get('/api/image-cache', (req, res) => res.json(imageCache));${C.reset}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
