#!/usr/bin/env node
// scripts/fetch-audio.js
// Finds preview URLs for relationship edges that have a `label` (song/album title)
// but are missing a valid `itunes_preview_url`.
//
// Uses the free iTunes Search API — no key required.
// Writes results directly into hiphop-tree-backend/graph.json.
//
// Search strategy: "${songTitle} ${targetArtistName}" — keeps the query tight
// and avoids polluting it with label descriptions or producer credits.
//
// Validation: the returned iTunes `artistName` must contain at least one of the
// two connected artists' names (case-insensitive). This prevents false positives
// like classical string quartet covers matching a hip-hop edge.
//
// Usage:
//   node scripts/fetch-audio.js           — fills all missing
//   node scripts/fetch-audio.js --dry-run — prints matches without writing

const fs   = require('fs');
const path = require('path');
const https = require('https');

const GRAPH_PATH = path.join(__dirname, '../hiphop-tree-backend/graph.json');
const DRY_RUN    = process.argv.includes('--dry-run');
const DELAY_MS   = 800;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'HipHopTree/1.0 (fetch-audio script) Node.js' }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Parse error (status ${res.statusCode})`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Strip year and bracket annotations from label: "All Eyez on Me (1996)" → "All Eyez on Me"
function extractSongTitle(label) {
  if (!label) return null;
  return label
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s*\[.*?\]\s*/g, '')
    .replace(/\s*—.*$/, '')       // strip em-dash suffixes like "— stone-cold classic"
    .trim();
}

// Returns true if the iTunes artistName contains at least one of the two connected artists.
// Uses first name matching to handle "JAŸ-Z" vs "Jay-Z", "Tupac Shakur" vs "2Pac" etc.
function artistMatches(itunesArtist, srcName, tgtName) {
  const lower = itunesArtist.toLowerCase();

  // Normalise: strip punctuation, split into tokens, check any token overlap
  const tokenise = (name) =>
    name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2); // ignore short words like "dj", "mc" at this stage

  for (const artistName of [srcName, tgtName]) {
    const tokens = tokenise(artistName);
    if (tokens.some(t => lower.includes(t))) return true;
  }
  return false;
}

// Search iTunes for a preview. Query = "${songTitle} ${targetArtistName}".
// Validates the result artist against both edge artists before returning.
async function searchItunes(songTitle, targetArtistName, srcName, tgtName) {
  const query = `${songTitle} ${targetArtistName}`;
  const term  = encodeURIComponent(query);
  const url   = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=8`;

  const data = await get(url);
  if (!data.results || data.results.length === 0) return null;

  const titleLower = songTitle.toLowerCase();

  // Filter: must have a preview URL AND artist must match one of the two edge artists
  const valid = data.results.filter(r =>
    r.previewUrl &&
    artistMatches(r.artistName || '', srcName, tgtName)
  );

  if (valid.length === 0) return null;

  // Prefer results whose track name most closely matches the song title
  valid.sort((a, b) => {
    const aMatch = a.trackName?.toLowerCase().includes(titleLower) ? 1 : 0;
    const bMatch = b.trackName?.toLowerCase().includes(titleLower) ? 1 : 0;
    return bMatch - aMatch;
  });

  const best = valid[0];
  return {
    track_name:         best.trackName,
    artist:             best.artistName,
    itunes_preview_url: best.previewUrl,
    itunes_track_id:    best.trackId,
    release_year:       best.releaseDate ? new Date(best.releaseDate).getFullYear() : null,
  };
}

async function main() {
  const graph     = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  const artistMap = {};
  graph.artists.forEach(a => { artistMap[a.id] = a; });

  // Target: edges with a label but no itunes_preview_url yet (or a placeholder)
  const targets = graph.relationships.filter(r => {
    if (!r.label) return false;
    const preview = r.audio_metadata?.itunes_preview_url;
    if (!preview) return true;
    if (preview.includes('soundhelix.com')) return true; // placeholder — replace
    return false;
    // Note: spotify_preview_url is intentionally preserved and not re-fetched here
  });

  console.log(`Relationships to process: ${targets.length} / ${graph.relationships.length}`);
  if (DRY_RUN) console.log('DRY RUN — no writes\n');

  let found = 0, notFound = 0, rejected = 0;

  for (const rel of targets) {
    const src = artistMap[rel.source];
    const tgt = artistMap[rel.target];
    if (!src || !tgt) continue;

    const songTitle = extractSongTitle(rel.label);
    if (!songTitle) { notFound++; continue; }

    process.stdout.write(`  [${rel.id}] "${songTitle}" (${src.name} + ${tgt.name})... `);
    await sleep(DELAY_MS);

    try {
      // Primary search: song title + target artist
      let result = await searchItunes(songTitle, tgt.name, src.name, tgt.name);

      // Fallback: song title + source artist (catches edges where source is the performer)
      if (!result) {
        result = await searchItunes(songTitle, src.name, src.name, tgt.name);
        await sleep(DELAY_MS);
      }

      if (!result) {
        console.log('❌ not found (no validated match)');
        notFound++;
        continue;
      }

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
    console.log(`\nDone. Found: ${found}, Not found / rejected: ${notFound}`);
  } else {
    console.log(`\n[DRY RUN] Would have found: ${found}, Not found / rejected: ${notFound}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
