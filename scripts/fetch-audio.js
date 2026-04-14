#!/usr/bin/env node
// scripts/fetch-audio.js
// Finds preview URLs for relationship edges that have a `label` (song/album title)
// but are missing a valid `itunes_preview_url`.
//
// Uses the free iTunes Search API — no key required.
//
// Usage:
//   node scripts/fetch-audio.js                  — fills all missing (default: country=GB)
//   node scripts/fetch-audio.js --country=US      — use US storefront
//   node scripts/fetch-audio.js --dry-run         — print matches without writing
//
// Rate limiting: exponential backoff on 429/403 (up to 3 retries per request).
// Region restricted: tracks found but with no previewUrl are logged as such —
//   not counted as failures so you know they exist but are locked by storefront.

const fs   = require('fs');
const path = require('path');
const https = require('https');

const GRAPH_PATH = path.join(__dirname, '../hiphop-tree-backend/graph.json');
const DRY_RUN    = process.argv.includes('--dry-run');

// --country=XX from CLI, default GB
const countryArg = process.argv.find(a => a.startsWith('--country='));
const COUNTRY    = countryArg ? countryArg.split('=')[1].toUpperCase() : 'GB';

const BASE_DELAY_MS = 800;   // base delay between requests
const MAX_RETRIES   = 3;     // max retries on 429/403 before giving up
const BACKOFF_BASE  = 2000;  // initial backoff on rate-limit error (doubles each retry)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Raw HTTP GET — resolves with { data, status } or rejects on network error.
function getRaw(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'HipHopTree/1.0 (fetch-audio script) Node.js' }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ body, status: res.statusCode }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// GET with exponential backoff on 429 / 403 rate-limit responses.
// Returns parsed JSON or throws after MAX_RETRIES.
async function getWithRetry(url, attempt = 0) {
  const { body, status } = await getRaw(url);

  if (status === 429 || status === 403) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(`Rate limited (${status}) after ${MAX_RETRIES} retries`);
    }
    const wait = BACKOFF_BASE * Math.pow(2, attempt);
    console.log(`\n    ⏳ Rate limited (${status}) — waiting ${wait / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
    await sleep(wait);
    return getWithRetry(url, attempt + 1);
  }

  if (status !== 200) {
    throw new Error(`HTTP ${status}`);
  }

  try {
    return JSON.parse(body);
  } catch (e) {
    throw new Error(`Parse error (status ${status})`);
  }
}

// Strip year, bracket annotations, and em-dash suffixes from label:
//   "All Eyez on Me (1996)" → "All Eyez on Me"
//   "Madvillainy (2004) — stone-cold classic" → "Madvillainy"
function extractSongTitle(label) {
  if (!label) return null;
  return label
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s*\[.*?\]\s*/g, '')
    .replace(/\s*—.*$/, '')
    .trim();
}

// Returns true if the iTunes artistName contains at least one token from either artist.
// Handles aliases: "JAŸ-Z" matches "Jay-Z", "ScHoolboy Q" matches "Schoolboy Q".
function artistMatches(itunesArtist, srcName, tgtName) {
  const lower = itunesArtist.toLowerCase();
  const tokenise = (name) =>
    name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2);

  for (const name of [srcName, tgtName]) {
    if (tokenise(name).some(t => lower.includes(t))) return true;
  }
  return false;
}

// Search iTunes for a matching track.
// Returns:
//   { match: {...} }          — found a valid result with a preview URL
//   { regionRestricted: true } — found an artist-matched result but no previewUrl (storefront lock)
//   null                       — no artist-matched results at all
async function searchItunes(songTitle, queryArtist, srcName, tgtName) {
  const query = `${songTitle} ${queryArtist}`;
  const term  = encodeURIComponent(query);
  const url   = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=8&country=${COUNTRY}`;

  const data = await getWithRetry(url);
  if (!data.results || data.results.length === 0) return null;

  const titleLower = songTitle.toLowerCase();

  // Split results into: artist matches with preview, artist matches without preview
  const artistMatched = data.results.filter(r =>
    artistMatches(r.artistName || '', srcName, tgtName)
  );

  if (artistMatched.length === 0) return null;

  const withPreview = artistMatched.filter(r => r.previewUrl);

  // Artist found but no previews available in this storefront → region restricted
  if (withPreview.length === 0) return { regionRestricted: true };

  // Rank by title similarity
  withPreview.sort((a, b) => {
    const aMatch = a.trackName?.toLowerCase().includes(titleLower) ? 1 : 0;
    const bMatch = b.trackName?.toLowerCase().includes(titleLower) ? 1 : 0;
    return bMatch - aMatch;
  });

  const best = withPreview[0];
  return {
    match: {
      track_name:         best.trackName,
      artist:             best.artistName,
      itunes_preview_url: best.previewUrl,
      itunes_track_id:    best.trackId,
      release_year:       best.releaseDate ? new Date(best.releaseDate).getFullYear() : null,
    }
  };
}

async function main() {
  const graph     = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  const artistMap = {};
  graph.artists.forEach(a => { artistMap[a.id] = a; });

  const targets = graph.relationships.filter(r => {
    if (!r.label) return false;
    const preview = r.audio_metadata?.itunes_preview_url;
    if (!preview) return true;
    if (preview.includes('soundhelix.com')) return true; // placeholder — replace
    return false;
  });

  console.log(`Country storefront : ${COUNTRY}`);
  console.log(`Relationships to process: ${targets.length} / ${graph.relationships.length}`);
  if (DRY_RUN) console.log('DRY RUN — no writes\n');

  let found = 0, notFound = 0, regionRestricted = 0;

  for (const rel of targets) {
    const src = artistMap[rel.source];
    const tgt = artistMap[rel.target];
    if (!src || !tgt) continue;

    const songTitle = extractSongTitle(rel.label);
    if (!songTitle) { notFound++; continue; }

    process.stdout.write(`  [${rel.id}] "${songTitle}" (${src.name} + ${tgt.name})... `);
    await sleep(BASE_DELAY_MS);

    try {
      // Primary: song title + target artist name
      let response = await searchItunes(songTitle, tgt.name, src.name, tgt.name);

      // Fallback: song title + source artist name
      if (!response) {
        await sleep(BASE_DELAY_MS);
        response = await searchItunes(songTitle, src.name, src.name, tgt.name);
      }

      if (!response) {
        console.log('❌ not found');
        notFound++;
        continue;
      }

      if (response.regionRestricted) {
        console.log(`🌐 Region Restricted (${COUNTRY} storefront has no preview — try --country=US)`);
        regionRestricted++;
        continue;
      }

      const result = response.match;
      console.log(`✅ "${result.track_name}" by ${result.artist}`);
      found++;

      if (!DRY_RUN) {
        if (!rel.audio_metadata) rel.audio_metadata = {};
        rel.audio_metadata.track_name         = rel.audio_metadata.track_name || result.track_name;
        rel.audio_metadata.itunes_preview_url = result.itunes_preview_url;
        rel.audio_metadata.itunes_track_id    = result.itunes_track_id;
        rel.audio_metadata.release_year       = rel.audio_metadata.release_year || result.release_year;
        if (rel.audio_metadata.spotify_preview_url?.includes('soundhelix.com')) {
          delete rel.audio_metadata.spotify_preview_url;
        }
      }
    } catch (err) {
      console.log(`❌ error: ${err.message}`);
      notFound++;
    }
  }

  if (!DRY_RUN) {
    fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), 'utf8');
  }

  console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Done.`);
  console.log(`  ✅ Found:             ${found}`);
  console.log(`  🌐 Region restricted: ${regionRestricted}`);
  console.log(`  ❌ Not found:         ${notFound}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
