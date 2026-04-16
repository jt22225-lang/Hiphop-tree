#!/usr/bin/env node
// Targeted audio fetch for specific relationship IDs only.
// Usage: node scripts/fetch-audio-targeted.js rel_087 rel_088 rel_2w07

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const GRAPH_PATH = path.join(__dirname, '../hiphop-tree-backend/graph.json');
const TARGET_IDS = new Set(process.argv.slice(2));

if (!TARGET_IDS.size) {
  console.error('Usage: node fetch-audio-targeted.js <rel_id> [rel_id...]');
  process.exit(1);
}

const BASE_DELAY_MS = 900;
const MAX_RETRIES   = 3;
const BACKOFF_BASE  = 2000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getRaw(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'HipHopTree/1.0 (fetch-audio-targeted) Node.js' }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ body, status: res.statusCode }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function getWithRetry(url, attempt = 0) {
  const { body, status } = await getRaw(url);
  if (status === 429 || status === 403) {
    if (attempt >= MAX_RETRIES) throw new Error(`Rate limited (${status}) after ${MAX_RETRIES} retries`);
    const wait = BACKOFF_BASE * Math.pow(2, attempt);
    process.stdout.write(`\n  ⏳ Rate limited — waiting ${wait / 1000}s... `);
    await sleep(wait);
    return getWithRetry(url, attempt + 1);
  }
  if (status !== 200) throw new Error(`HTTP ${status}`);
  try { return JSON.parse(body); }
  catch { throw new Error(`Parse error (status ${status})`); }
}

function extractSongTitle(label) {
  if (!label) return null;
  return label
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s*\[.*?\]\s*/g, '')
    .replace(/\s*—.*$/, '')
    .trim();
}

function artistMatches(itunesArtist, srcName, tgtName) {
  const lower    = itunesArtist.toLowerCase();
  const tokenise = name =>
    name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
  return [srcName, tgtName].some(name => tokenise(name).some(t => lower.includes(t)));
}

async function searchItunes(songTitle, queryArtist, srcName, tgtName, country) {
  const term = encodeURIComponent(`${songTitle} ${queryArtist}`);
  const url  = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=8&country=${country}`;
  const data = await getWithRetry(url);
  if (!data.results?.length) return null;

  const titleLower  = songTitle.toLowerCase();
  const artistHits  = data.results.filter(r => artistMatches(r.artistName || '', srcName, tgtName));
  if (!artistHits.length) return null;

  const withPreview = artistHits.filter(r => r.previewUrl);
  if (!withPreview.length) return { regionRestricted: true };

  const titleWords = titleLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
  const scored = withPreview.map(r => {
    const tn         = (r.trackName || '').toLowerCase();
    const exactMatch = tn.includes(titleLower) ? 4 : 0;
    const wordOverlap = titleWords.filter(w => tn.includes(w)).length;
    return { r, score: exactMatch + wordOverlap };
  });

  const titleMatches = scored.filter(s => s.score > 0);
  if (!titleMatches.length) { process.stdout.write('[no title match] '); return null; }

  titleMatches.sort((a, b) => b.score - a.score);
  const best = titleMatches[0].r;
  return {
    match: {
      track_name:   best.trackName,
      artist:       best.artistName,
      preview_url:  best.previewUrl,
      artwork_url:  best.artworkUrl100 ?? null,
      track_id:     best.trackId,
      release_year: best.releaseDate ? new Date(best.releaseDate).getFullYear() : null,
    }
  };
}

async function main() {
  const graph     = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  const artistMap = {};
  graph.artists.forEach(a => { artistMap[a.id] = a; });

  const targets = graph.relationships.filter(r => TARGET_IDS.has(r.id));

  console.log(`Targeting ${targets.length} edges: ${[...TARGET_IDS].join(', ')}`);

  for (const rel of targets) {
    const src      = artistMap[rel.source];
    const tgt      = artistMap[rel.target];
    const rawTitle = extractSongTitle(rel.label);

    console.log(`\n[${rel.id}] "${rawTitle}" — ${src?.name} × ${tgt?.name}`);
    console.log(`  Label: ${rel.label}`);

    if (!src || !tgt || !rawTitle) { console.log('  ⚠️  Missing artist or title — skip'); continue; }

    for (const country of ['US', 'GB']) {
      const field = country === 'US' ? 'preview_url_us' : 'preview_url_gb';
      if (rel.audio_metadata?.[field]) {
        console.log(`  ${country}: already set (${rel.audio_metadata[field].slice(0, 60)}...)`);
        continue;
      }

      process.stdout.write(`  ${country}: searching "${rawTitle} ${tgt.name}"... `);
      await sleep(BASE_DELAY_MS);

      let response = await searchItunes(rawTitle, tgt.name, src.name, tgt.name, country).catch(() => null);
      if (!response) {
        process.stdout.write(`retry with src... `);
        await sleep(BASE_DELAY_MS);
        response = await searchItunes(rawTitle, src.name, src.name, tgt.name, country).catch(() => null);
      }

      if (!response) {
        console.log('❌ not found');
      } else if (response.regionRestricted) {
        console.log(`🌐 region restricted`);
      } else {
        const m = response.match;
        console.log(`✅ "${m.track_name}" by ${m.artist} (${m.release_year})`);
        if (!rel.audio_metadata) rel.audio_metadata = {};
        rel.audio_metadata.track_name  = rel.audio_metadata.track_name  || m.track_name;
        rel.audio_metadata[field]      = m.preview_url;
        if (!rel.audio_metadata.artwork_url)     rel.audio_metadata.artwork_url     = m.artwork_url;
        if (!rel.audio_metadata.itunes_track_id) rel.audio_metadata.itunes_track_id = m.track_id;
        if (!rel.audio_metadata.release_year)    rel.audio_metadata.release_year    = m.release_year;
      }
    }
  }

  fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), 'utf8');
  console.log('\n✅ graph.json saved.');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
