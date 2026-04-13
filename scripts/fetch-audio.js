#!/usr/bin/env node
// scripts/fetch-audio.js
// Finds preview URLs for relationship edges that have a `label` (song/album title)
// but are missing `audio_metadata.spotify_preview_url`.
//
// Uses the free iTunes Search API — no key required.
// Writes results directly into hiphop-tree-backend/graph.json.
//
// Usage:
//   node scripts/fetch-audio.js           — fills all missing
//   node scripts/fetch-audio.js --dry-run — prints matches without writing

const fs   = require('fs');
const path = require('path');
const https = require('https');

const GRAPH_PATH = path.join(__dirname, '../hiphop-tree-backend/graph.json');
const DRY_RUN    = process.argv.includes('--dry-run');
const DELAY_MS   = 800; // iTunes rate-limit: stay well under their threshold

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

// Clean a label like "The Chronic (1992)" → "The Chronic"
function extractSongTitle(label) {
  if (!label) return null;
  return label
    .replace(/\s*\(\d{4}\)\s*$/, '')   // strip trailing year e.g. "(1992)"
    .replace(/\s*\[.*?\]\s*/g, '')      // strip [brackets]
    .trim();
}

// iTunes search: returns best matching preview URL + track metadata, or null
async function searchItunes(artistNames, songTitle) {
  const term = encodeURIComponent(`${artistNames} ${songTitle}`);
  const url  = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=5`;

  const data = await get(url);
  if (!data.results || data.results.length === 0) return null;

  // Score candidates: prefer tracks whose name closely matches songTitle
  const titleLower = songTitle.toLowerCase();
  const sorted = data.results
    .filter(r => r.previewUrl)
    .sort((a, b) => {
      const aMatch = a.trackName?.toLowerCase().includes(titleLower) ? 1 : 0;
      const bMatch = b.trackName?.toLowerCase().includes(titleLower) ? 1 : 0;
      return bMatch - aMatch;
    });

  if (sorted.length === 0) return null;
  const best = sorted[0];

  return {
    track_name:          best.trackName,
    artist:              best.artistName,
    album:               best.collectionName,
    itunes_preview_url:  best.previewUrl,
    itunes_track_id:     best.trackId,
    release_year:        best.releaseDate ? new Date(best.releaseDate).getFullYear() : null,
  };
}

async function main() {
  const graph     = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  const artistMap = {};
  graph.artists.forEach(a => { artistMap[a.id] = a; });

  // Target: edges with a label but no audio preview yet (or only a placeholder)
  const targets = graph.relationships.filter(r => {
    if (!r.label) return false;
    const preview = r.audio_metadata?.spotify_preview_url || r.audio_metadata?.itunes_preview_url;
    if (!preview) return true;                          // no audio at all
    if (preview.includes('soundhelix.com')) return true; // placeholder — replace it
    return false;
  });

  console.log(`Relationships to process: ${targets.length} / ${graph.relationships.length}`);
  if (DRY_RUN) console.log('DRY RUN — no writes\n');

  let found = 0, notFound = 0;

  for (const rel of targets) {
    const src = artistMap[rel.source];
    const tgt = artistMap[rel.target];
    if (!src || !tgt) continue;

    const songTitle   = extractSongTitle(rel.label);
    const artistNames = `${src.name} ${tgt.name}`;

    process.stdout.write(`  [${rel.id}] "${songTitle}" (${src.name} + ${tgt.name})... `);
    await sleep(DELAY_MS);

    try {
      const result = await searchItunes(artistNames, songTitle);

      if (!result) {
        // Try searching by song title only
        const result2 = await searchItunes(src.name, songTitle);
        if (!result2) {
          console.log('❌ not found');
          notFound++;
          continue;
        }
        Object.assign(result || {}, result2);
      }

      const meta = result || await searchItunes(src.name, songTitle);
      if (!meta) { console.log('❌ not found'); notFound++; continue; }

      console.log(`✅ "${meta.track_name}" by ${meta.artist} → ${meta.itunes_preview_url.slice(0, 60)}...`);
      found++;

      if (!DRY_RUN) {
        if (!rel.audio_metadata) rel.audio_metadata = {};
        rel.audio_metadata.track_name         = rel.audio_metadata.track_name || meta.track_name;
        rel.audio_metadata.itunes_preview_url = meta.itunes_preview_url;
        rel.audio_metadata.itunes_track_id    = meta.itunes_track_id;
        rel.audio_metadata.release_year       = rel.audio_metadata.release_year || meta.release_year;
        // Keep spotify_preview_url if it was real (not a placeholder)
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

  console.log(`\n${ DRY_RUN ? '[DRY RUN] ' : ''}Done. Found: ${found}, Not found: ${notFound}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
