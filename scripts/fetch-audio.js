#!/usr/bin/env node
// scripts/fetch-audio.js
// Dual-pass iTunes audio fetch for all relationship edges that have a label
// but are missing preview_url_us or preview_url_gb.
//
// Pass 1: iTunes US storefront  → saves to audio_metadata.preview_url_us
// Pass 2: iTunes GB storefront  → saves to audio_metadata.preview_url_gb
//
// Safety: edges with audio_metadata.manual_audio = true are never overwritten.
//
// Usage:
//   node scripts/fetch-audio.js                      — dual-pass (US + GB)
//   node scripts/fetch-audio.js --us-only            — US pass only
//   node scripts/fetch-audio.js --gb-only            — GB pass only
//   node scripts/fetch-audio.js --artwork-only       — backfill artwork_url for edges that already have audio
//   node scripts/fetch-audio.js --dry-run            — print matches without writing
//   node scripts/fetch-audio.js --classify-only      — show label classification (🎵 SONG vs 🏷️  DESCRIPTOR) without calling iTunes
//   node scripts/fetch-audio.js --us-only --classify-only  — show US-pass classifications only

const fs   = require('fs');
const path = require('path');
const https = require('https');

const GRAPH_PATH    = path.join(__dirname, '../hiphop-tree-backend/graph.json');
const DRY_RUN       = process.argv.includes('--dry-run');
const US_ONLY       = process.argv.includes('--us-only');
const GB_ONLY       = process.argv.includes('--gb-only');
const ARTWORK_ONLY  = process.argv.includes('--artwork-only');
const CLASSIFY_ONLY = process.argv.includes('--classify-only');
const LIST_SONGS_ONLY = process.argv.includes('--list-songs-only');

const RUN_US = !GB_ONLY && !ARTWORK_ONLY;
const RUN_GB = !US_ONLY && !ARTWORK_ONLY;

const BASE_DELAY_MS = 1500;  // Increased from 900ms to avoid rate limiting
const MAX_RETRIES   = 5;     // More retries for rate-limit recovery
const BACKOFF_BASE  = 3000;  // Start backoff at 3s for rate limits

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getRaw(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'HipHopTree/1.0 (fetch-audio) Node.js' }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ body, status: res.statusCode }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

async function getWithRetry(url, attempt = 0) {
  const { body, status } = await getRaw(url);

  if (status === 429 || status === 403) {
    if (attempt >= MAX_RETRIES) {
      throw new RateLimitError(`Rate limited (${status}) after ${MAX_RETRIES} retries — pausing before retry`);
    }
    const wait = BACKOFF_BASE * Math.pow(2, attempt);
    process.stdout.write(`\n    ⏳ Rate limited (${status}) — waiting ${wait / 1000}s (retry ${attempt + 1}/${MAX_RETRIES})... `);
    await sleep(wait);
    return getWithRetry(url, attempt + 1);
  }

  if (status !== 200) throw new Error(`HTTP ${status}`);

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Parse error (status ${status})`);
  }
}

// Classifies relationship labels as "song" (searchable on iTunes) or "descriptor" (skip iTunes)
// STRICT ALLOWLIST: Only classifies as "song" if it matches pattern: "Title (YYYY)"
// with no narrative/explanatory text. This avoids mismatches on iTunes.
function classifyLabel(label) {
  if (!label) return 'descriptor';

  // RULE 1: If there's a dash followed by explanatory text anywhere, it's a descriptor
  if (/\s*—\s*./.test(label)) {
    return 'descriptor';
  }

  // RULE 2: Must have a year in parentheses at the end
  const hasYear = /\(\d{4}\)\s*$/.test(label);
  if (!hasYear) return 'descriptor';

  // RULE 3: Extract the title part (before the year)
  const stripped = label.replace(/\s*\(\d{4}\)\s*$/, '').trim();

  // RULE 4: Reject if contains narrative/relationship keywords that indicate a descriptor
  const narrativeKeywords = /\b(era|collab|session|sessions|connection|feature|featuring|signed|produced|production|mentored|wrote|influenced|arranged|featured|performed|debuted|released|launched|executive|blueprint|lineage|generation|contemporary|ally|peer|influence|inspiration|legacy|torch|renaissance|wave|cycle|chapter|expansion|movement|alliance|crossover|introduced|managed|recruited|spotted|recognized|established|founded|rivalry|resolved)\b/i;

  if (narrativeKeywords.test(stripped)) {
    return 'descriptor';
  }

  // RULE 5: Reject if contains coordinating words like "and" or "&"
  // These suggest multiple relationships/items, not a single song title
  if (/\s+(and|&)\s+/.test(stripped)) {
    return 'descriptor';
  }

  // RULE 6: Title should be reasonably short (real titles, not full sentences)
  if (stripped.length > 80) {
    return 'descriptor';
  }

  // If it passed all checks, it's likely a real song/album title
  return 'song';
}

function extractSongTitle(label) {
  if (!label) return null;

  // SAFETY: Only extract title if classifyLabel says it's a song, not a descriptor.
  // This prevents searching for factual relationship labels like "Signed to Aftermath (1998)"
  // which are not song titles and can lead to wrong audio being matched.
  if (classifyLabel(label) !== 'song') {
    return null;
  }

  return label
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s*\[.*?\]\s*/g, '')
    .replace(/\s*—.*$/, '')
    .trim();
}

function artistMatches(itunesArtist, srcName, tgtName) {
  const lower = itunesArtist.toLowerCase();
  const tokenise = name =>
    name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);

  return [srcName, tgtName].some(name => tokenise(name).some(t => lower.includes(t)));
}

// Returns { match } | { regionRestricted: true } | null
async function searchItunes(songTitle, queryArtist, srcName, tgtName, country) {
  const term = encodeURIComponent(`${songTitle} ${queryArtist}`);
  const url  = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=8&country=${country}`;

  const data = await getWithRetry(url);
  if (!data.results?.length) return null;

  const titleLower   = songTitle.toLowerCase();
  const artistHits   = data.results.filter(r => artistMatches(r.artistName || '', srcName, tgtName));

  if (!artistHits.length) return null;

  const withPreview  = artistHits.filter(r => r.previewUrl);
  if (!withPreview.length) return { regionRestricted: true };

  // Exact-match scoring: require the track name to contain the query title words,
  // not just any artist match.  Prevents P.I.M.P.-style misfires where a different
  // song by the same artist outranks the intended target.
  const titleWords = titleLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);

  const scored = withPreview.map(r => {
    const tn = (r.trackName || '').toLowerCase();
    // Exact title containment is the highest signal
    const exactMatch  = tn.includes(titleLower) ? 4 : 0;
    // Word-level overlap as secondary signal
    const wordOverlap = titleWords.filter(w => tn.includes(w)).length;
    return { r, score: exactMatch + wordOverlap };
  });

  // Require at least one title word to match — discard total misses
  const titleMatches = scored.filter(s => s.score > 0);
  if (!titleMatches.length) {
    process.stdout.write('[no title match] ');
    return null;
  }

  titleMatches.sort((a, b) => b.score - a.score);
  const best = titleMatches[0].r;
  return {
    match: {
      track_name:    best.trackName,
      artist:        best.artistName,
      preview_url:   best.previewUrl,
      artwork_url:   best.artworkUrl100 ?? null,
      track_id:      best.trackId,
      release_year:  best.releaseDate ? new Date(best.releaseDate).getFullYear() : null,
    }
  };
}

async function runPass(graph, artistMap, country, targetField, label) {
  const targets = graph.relationships.filter(r => {
    if (!r.label) return false;
    if (r.audio_metadata?.manual_audio) return false;      // never overwrite hand-picked
    return !r.audio_metadata?.[targetField];               // skip if already populated
  });

  console.log(`\n── ${label} pass (${country}) ──────────────────────────`);
  console.log(`   Total to process: ${targets.length}`);

  let found = 0, genuinelyNotFound = 0, notApplicable = 0, restricted = 0;

  for (const rel of targets) {
    const src = artistMap[rel.source];
    const tgt = artistMap[rel.target];
    if (!src || !tgt) continue;

    // Classify label FIRST before any processing
    const classification = classifyLabel(rel.label);
    if (classification === 'descriptor') {
      if (CLASSIFY_ONLY || LIST_SONGS_ONLY) {
        // Suppress descriptor output in list-songs mode; only show songs
        if (!LIST_SONGS_ONLY) {
          console.log(`  [${rel.id}] 🏷️  DESCRIPTOR  "${rel.label}"`);
        }
      }
      notApplicable++;
      continue;  // Skip iTunes search entirely for descriptors
    }

    // Only reach here if classification === 'song'
    const songTitle = extractSongTitle(rel.label);
    if (!songTitle) { genuinelyNotFound++; continue; }

    if (CLASSIFY_ONLY) {
      console.log(`  [${rel.id}] 🎵 SONG       "${rel.label}"`);
    }

    if (LIST_SONGS_ONLY) {
      // Collect and output songs for review
      console.log(`  [${rel.id}] "${rel.label}"`);
    }

    if (CLASSIFY_ONLY || LIST_SONGS_ONLY) continue;  // Skip iTunes if classifying/listing only

    process.stdout.write(`  [${rel.id}] "${songTitle}" (${src.name} + ${tgt.name})... `);
    await sleep(BASE_DELAY_MS);

    try {
      let response = await searchItunes(songTitle, tgt.name, src.name, tgt.name, country);

      if (!response) {
        await sleep(BASE_DELAY_MS);
        response = await searchItunes(songTitle, src.name, src.name, tgt.name, country);
      }

      if (!response) {
        console.log('❌ not found');
        genuinelyNotFound++;
        continue;
      }

      if (response.regionRestricted) {
        console.log(`🌐 Region Restricted in ${country}`);
        restricted++;
        continue;
      }

      const result = response.match;
      console.log(`✅ "${result.track_name}" by ${result.artist}`);
      found++;

      if (!DRY_RUN) {
        if (!rel.audio_metadata) rel.audio_metadata = {};
        // CRITICAL FIX: Always update track_name when updating preview_url
        // to prevent mismatch between displayed song and actual audio.
        // The iTunes search may find a different song on subsequent passes,
        // so we must ensure track_name matches the preview_url.
        rel.audio_metadata.track_name  = result.track_name;
        rel.audio_metadata[targetField] = result.preview_url;
        if (!rel.audio_metadata.artwork_url)     rel.audio_metadata.artwork_url     = result.artwork_url;
        if (!rel.audio_metadata.itunes_track_id) rel.audio_metadata.itunes_track_id = result.track_id;
        if (!rel.audio_metadata.release_year)    rel.audio_metadata.release_year    = result.release_year;
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        console.log(`\n⏸️  Rate limit hit — pausing 30s before continuing...`);
        await sleep(30000);
        console.log(`Resuming...`);
        genuinelyNotFound++;  // Skip this entry, will need manual retry
      } else {
        console.log(`❌ error: ${err.message}`);
        genuinelyNotFound++;
      }
    }
  }

  if (!LIST_SONGS_ONLY) {
    console.log(`   ✅ ${found}  🌐 ${restricted} restricted  ❌ ${genuinelyNotFound} not found  ⏭️  ${notApplicable} skipped (descriptor)`);
  }
  return { found, restricted, genuinelyNotFound, notApplicable };
}

// ── Artwork-only backfill ─────────────────────────────────────────────────────
// For edges that already have a preview URL but are missing artwork_url.
// Uses itunes_track_id for a direct lookup first; falls back to title search.
async function runArtworkPass(graph) {
  const targets = graph.relationships.filter(r => {
    if (!r.audio_metadata) return false;
    if (r.audio_metadata.manual_audio) return false;
    if (r.audio_metadata.artwork_url) return false;   // already done
    return r.audio_metadata.preview_url_us || r.audio_metadata.preview_url_gb;
  });

  console.log(`\n── Artwork backfill ────────────────────────────────`);
  console.log(`   Edges to process: ${targets.length}`);

  let found = 0, notFound = 0;

  for (const rel of targets) {
    const m = rel.audio_metadata;
    process.stdout.write(`  [${rel.id}] "${m.track_name}"... `);
    await sleep(BASE_DELAY_MS);

    try {
      let artworkUrl = null;

      // Direct lookup by track ID is fastest and most reliable
      if (m.itunes_track_id) {
        const url  = `https://itunes.apple.com/lookup?id=${m.itunes_track_id}`;
        const data = await getWithRetry(url);
        artworkUrl = data.results?.[0]?.artworkUrl100 ?? null;
      }

      // Fallback: re-search by track name in US store
      if (!artworkUrl && m.track_name) {
        const term = encodeURIComponent(m.track_name);
        const url  = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=4&country=US`;
        const data = await getWithRetry(url);
        artworkUrl = data.results?.find(r => r.previewUrl)?.artworkUrl100 ?? null;
      }

      if (artworkUrl) {
        console.log(`✅ got artwork`);
        found++;
        if (!DRY_RUN) m.artwork_url = artworkUrl;
      } else {
        console.log(`❌ no artwork`);
        notFound++;
      }
    } catch (err) {
      console.log(`❌ error: ${err.message}`);
      notFound++;
    }
  }

  console.log(`   ✅ ${found} artworks found  ❌ ${notFound} not found`);
  return { found, notFound };
}

async function main() {
  const graph     = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  const artistMap = {};
  graph.artists.forEach(a => { artistMap[a.id] = a; });

  const manualCount = graph.relationships.filter(r => r.audio_metadata?.manual_audio).length;
  console.log(`Loaded ${graph.relationships.length} relationships`);
  console.log(`Protected (manual_audio=true): ${manualCount}`);
  if (DRY_RUN) console.log('DRY RUN — no writes');

  const totals = { found: 0, restricted: 0, genuinelyNotFound: 0, notApplicable: 0 };

  if (ARTWORK_ONLY) {
    await runArtworkPass(graph);
    if (!DRY_RUN) {
      fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), 'utf8');
      console.log('\n✅ graph.json saved.');
    }
    return;
  }

  if (RUN_US) {
    const r = await runPass(graph, artistMap, 'US', 'preview_url_us', 'US');
    totals.found += r.found; totals.restricted += r.restricted;
    totals.genuinelyNotFound += r.genuinelyNotFound; totals.notApplicable += r.notApplicable;
  }

  if (RUN_GB) {
    const r = await runPass(graph, artistMap, 'GB', 'preview_url_gb', 'GB');
    totals.found += r.found; totals.restricted += r.restricted;
    totals.genuinelyNotFound += r.genuinelyNotFound; totals.notApplicable += r.notApplicable;
  }

  if (LIST_SONGS_ONLY) {
    console.log(`\n========================================`);
    console.log(`Total songs that would be searched: ${558 - totals.notApplicable}`);
    console.log(`Total descriptors skipped: ${totals.notApplicable}`);
    console.log(`========================================`);
    return;
  }

  if (!DRY_RUN) {
    fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), 'utf8');
    console.log('\n✅ graph.json saved.');
  }

  console.log(`\nTotal — ✅ ${totals.found} found  🌐 ${totals.restricted} restricted  ❌ ${totals.genuinelyNotFound} not found  ⏭️  ${totals.notApplicable} skipped (descriptor)`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
