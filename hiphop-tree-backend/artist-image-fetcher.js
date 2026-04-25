/**
 * artist-image-fetcher.js
 *
 * Resolves artist photo URLs using Wikipedia's free public API — no keys needed.
 * Uses axios (already installed) to call the same MediaWiki REST API that any
 * dedicated Wikipedia client wraps, so no extra dependency is required.
 *
 * Storage layer (in priority order):
 *   1. artist-images-cache.json  — local flat file, always written, works offline
 *   2. Supabase artist_images    — persists across deploys when env vars are set
 *
 * CLI:
 *   node artist-image-fetcher.js           — process all artists in graph.json
 *   node artist-image-fetcher.js --missing — only artists not yet in cache
 *
 * Module:
 *   const { fetchAndCacheArtistImages, getLocalCache } = require('./artist-image-fetcher');
 */
require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const graphData  = require('./graph.json');
const CACHE_FILE = path.join(__dirname, 'artist-images-cache.json');
const UA         = 'HipHopTree/1.0 (https://hiphoptree.com) Node.js';
const DELAY_MS   = 200;  // polite gap between Wikipedia requests
const CONCURRENCY = 3;

// ── Local JSON cache ─────────────────────────────────────────
function getLocalCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch { return {}; }
}

function saveLocalCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ── Supabase artist_images table (optional) ──────────────────
let _sb = null;
function getSupabase() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key || url === 'your_supabase_project_url_here') return null;
  try { _sb = createClient(url, key); return _sb; }
  catch { return null; }
}

async function supabaseGet(artistId) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from('artist_images')
      .select('image_url')
      .eq('artist_id', artistId)
      .maybeSingle();
    return data?.image_url || null;
  } catch { return null; }
}

async function supabaseSet(artistId, imageUrl) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('artist_images').upsert(
      { artist_id: artistId, image_url: imageUrl, cached_at: new Date().toISOString() },
      { onConflict: 'artist_id' }
    );
  } catch (e) {
    console.warn(`  [supabase] write failed for ${artistId}: ${e.message}`);
  }
}

// ── Wikipedia image resolution (no auth needed) ──────────────
function nameVariants(name) {
  const variants = [name];
  const stripped = name.replace(/\$/g, 's').replace(/[^\w\s'.-]/g, '').trim();
  if (stripped !== name) variants.push(stripped);
  variants.push(`${name} (rapper)`);
  variants.push(`${name} (hip hop musician)`);
  return [...new Set(variants)];
}

async function wikipediaPageImage(title) {
  try {
    const res = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: { action: 'query', titles: title, prop: 'pageimages', format: 'json', pithumbsize: 300, redirects: 1 },
      headers: { 'User-Agent': UA },
      timeout: 8000,
    });
    const page = Object.values(res.data?.query?.pages || {})[0];
    if (!page || page.missing !== undefined) return null;
    return page?.thumbnail?.source || null;
  } catch { return null; }
}

async function wikidataP18(qid) {
  try {
    const res = await axios.get('https://www.wikidata.org/w/api.php', {
      params: { action: 'wbgetclaims', entity: qid, property: 'P18', format: 'json' },
      headers: { 'User-Agent': UA },
      timeout: 8000,
    });
    const filename = res.data?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!filename) return null;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename.replace(/ /g, '_'))}?width=300`;
  } catch { return null; }
}

async function wikidataSearch(name) {
  try {
    const res = await axios.get('https://www.wikidata.org/w/api.php', {
      params: { action: 'wbsearchentities', search: name, language: 'en', format: 'json', limit: 3, type: 'item' },
      headers: { 'User-Agent': UA },
      timeout: 8000,
    });
    for (const result of (res.data?.search || []).slice(0, 2)) {
      const img = await wikidataP18(result.id);
      if (img) return img;
    }
  } catch {}
  return null;
}

async function resolveArtistImage(name, wikidataId = null) {
  for (const variant of nameVariants(name)) {
    const img = await wikipediaPageImage(variant);
    if (img) return img;
  }
  if (wikidataId) {
    const img = await wikidataP18(wikidataId);
    if (img) return img;
  }
  return wikidataSearch(name);
}

// ── Core ─────────────────────────────────────────────────────
/**
 * Resolve images for the given artist IDs.
 * Checks local cache → Supabase → Wikipedia, in that order.
 * Writes any new finds to both storage layers.
 *
 * @param {string[]} artistIds
 * @returns {{ results: Object.<string, string|null>, missing: string[] }}
 */
async function fetchAndCacheArtistImages(artistIds) {
  const localCache = getLocalCache();
  const results    = {};
  const missing    = [];

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < artistIds.length; i += CONCURRENCY) {
    const batch = artistIds.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async id => {
      const artist = graphData.artists.find(a => a.id === id);
      if (!artist) { results[id] = null; return; }

      // 1. Local cache
      if (localCache[id]) { results[id] = localCache[id]; return; }

      // 2. Supabase
      const sbUrl = await supabaseGet(id);
      if (sbUrl) {
        results[id] = sbUrl;
        localCache[id] = sbUrl;
        return;
      }

      // 3. Wikipedia / Wikidata
      try {
        const img = await resolveArtistImage(artist.name, artist.metadata?.wikidataId || null);
        results[id] = img || null;

        if (img) {
          localCache[id] = img;
          await supabaseSet(id, img);
        } else {
          missing.push(artist.name);
        }
      } catch (e) {
        console.warn(`  [error] ${artist.name}: ${e.message}`);
        results[id] = null;
        missing.push(artist.name);
      }
    }));

    // Save progress after every batch so a mid-run crash preserves work
    saveLocalCache(localCache);

    if (i + CONCURRENCY < artistIds.length) await sleep(DELAY_MS);
  }

  return { results, missing };
}

// ── CLI ──────────────────────────────────────────────────────
async function main() {
  const missingOnly = process.argv.includes('--missing');
  const localCache  = getLocalCache();

  let artists = graphData.artists;
  if (missingOnly) {
    artists = artists.filter(a => !localCache[a.id]);
    console.log(`\n🎤 Artist Image Fetcher — ${artists.length} artists without cached images\n`);
  } else {
    console.log(`\n🎤 Artist Image Fetcher — ${artists.length} artists total\n`);
  }

  if (artists.length === 0) {
    console.log('  Nothing to do — all artists already cached.\n');
    return;
  }

  const ids = artists.map(a => a.id);
  let fetched = 0; let skipped = 0;

  // Progress output during the run
  const originalFetch = fetchAndCacheArtistImages;
  const localCacheSnapshot = getLocalCache();

  const { results, missing } = await fetchAndCacheArtistImages(ids);

  Object.entries(results).forEach(([id, url]) => {
    const wasInCache = !!localCacheSnapshot[id];
    if (wasInCache)        skipped++;
    else if (url)          { fetched++; console.log(`  ✓ ${graphData.artists.find(a => a.id === id)?.name}`); }
    else if (!wasInCache)  console.log(`  ✗ ${graphData.artists.find(a => a.id === id)?.name} — not found`);
  });

  const found = Object.values(results).filter(Boolean).length;
  console.log(`\n📊 Results:`);
  console.log(`   Resolved  : ${found}/${ids.length}`);
  console.log(`   From cache: ${skipped}`);
  console.log(`   Newly fetched: ${fetched}`);
  if (missing.length) {
    console.log(`\n⚠️  No image found for ${missing.length} artist(s):`);
    missing.forEach(n => console.log(`   - ${n}`));
  }
  console.log();
}

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
}

module.exports = { fetchAndCacheArtistImages, getLocalCache };
