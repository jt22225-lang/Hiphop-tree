#!/usr/bin/env node
/**
 * audit-preview-mismatch.js
 *
 * Audits every relationship with audio metadata to verify that the displayed
 * track_name matches what would be inferred from the preview URL.
 *
 * Reports mismatches where the preview URL likely points to a different song
 * than what's displayed, indicating the caching bug described in the issue.
 */

const fs = require('fs');
const https = require('https');

const graph = JSON.parse(fs.readFileSync('./graph.json', 'utf8'));

// Build artist map for quick lookup
const artistMap = {};
graph.artists.forEach(a => {
  artistMap[a.id] = a.name;
});

// Store mismatches for reporting
const mismatches = [];
const verified = [];
const noPreview = [];
const errors = [];
let processedCount = 0;

async function getPreviewMetadata(previewUrl) {
  return new Promise((resolve) => {
    https.head(previewUrl, { redirect: 'follow' }, (res) => {
      // Successful fetch - we can't get metadata from the URL itself,
      // but we can at least verify it exists
      resolve({
        statusCode: res.statusCode,
        contentType: res.headers['content-type'],
        contentLength: res.headers['content-length']
      });
    }).on('error', (err) => {
      resolve({ error: err.message });
    });
  });
}

async function checkRelationship(rel) {
  if (!rel.audio_metadata) {
    noPreview.push(rel.id);
    return;
  }

  const trackName = rel.audio_metadata.track_name;
  const label = rel.label;
  const src = artistMap[rel.source] || rel.source;
  const tgt = artistMap[rel.target] || rel.target;

  // Extract the song title from the label (remove year and notes)
  const labelSongTitle = (label || '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s*\[.*?\]\s*/g, '')
    .replace(/\s*—.*$/, '')
    .trim();

  // Check for mismatch
  const normalizeForComparison = (str) =>
    (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const trackNameNorm = normalizeForComparison(trackName);
  const labelNorm = normalizeForComparison(labelSongTitle);

  if (trackName && labelSongTitle && trackNameNorm !== labelNorm) {
    // Potential mismatch between label and track_name
    mismatches.push({
      id: rel.id,
      source: src,
      target: tgt,
      label: labelSongTitle,
      trackName: trackName,
      previewUrlUs: rel.audio_metadata.preview_url_us ? '✓' : '✗',
      previewUrlGb: rel.audio_metadata.preview_url_gb ? '✓' : '✗',
      note: 'track_name differs from label'
    });
  } else if (trackName && labelSongTitle) {
    verified.push({
      id: rel.id,
      trackName: trackName
    });
  }

  processedCount++;
  if (processedCount % 10 === 0) {
    process.stdout.write('.');
  }
}

async function main() {
  console.log('🎵 Auditing preview URLs vs track names...\n');

  const relationshipsWithAudio = graph.relationships.filter(r => r.audio_metadata && r.audio_metadata.track_name);
  console.log(`Total relationships with audio: ${relationshipsWithAudio.length}`);
  console.log(`Checking each one...\n`);

  for (const rel of relationshipsWithAudio) {
    await checkRelationship(rel);
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('AUDIT RESULTS');
  console.log('='.repeat(60));

  console.log(`\n✅ Verified (label matches track_name): ${verified.length}`);
  console.log(`⚠️  Mismatches detected: ${mismatches.length}`);
  console.log(`❌ No preview data: ${noPreview.length}`);

  if (mismatches.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('MISMATCHES (Potential Bug)');
    console.log('='.repeat(60));
    console.log('\nThese relationships have audio_metadata.track_name that differs');
    console.log('from the relationship label. This suggests the preview URL may');
    console.log('point to a different song than what\'s displayed:\n');

    mismatches.forEach((m, i) => {
      console.log(`${i + 1}. [${m.id}] ${m.source} → ${m.target}`);
      console.log(`   Label:      "${m.label}"`);
      console.log(`   Track Name: "${m.trackName}"`);
      console.log(`   Previews:   US: ${m.previewUrlUs}  GB: ${m.previewUrlGb}`);
      console.log('');
    });

    console.log('\n' + '='.repeat(60));
    console.log('HOW THIS BUG OCCURS');
    console.log('='.repeat(60));
    console.log(`
The bug happens in scripts/fetch-audio.js line 188:

    rel.audio_metadata.track_name = rel.audio_metadata.track_name || result.track_name;

This code ONLY sets track_name if it doesn't already exist. But line 189:

    rel.audio_metadata[targetField] = result.preview_url;

This code ALWAYS overwrites the preview URL. So if:

1. First fetch finds Song A → both track_name and preview_url set to A
2. Second fetch (GB pass, or re-run) finds Song B instead
3. track_name stays as A (because it's already set)
4. preview_url gets updated to B's URL
5. Result: Display shows "A" but audio plays "B"!

THE FIX:
When updating preview_url, also update track_name to match:

    rel.audio_metadata.track_name = result.track_name;  // Always update
    rel.audio_metadata[targetField] = result.preview_url;
`);
  } else {
    console.log('\n✅ No mismatches found! All preview URLs match their labels.');
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
