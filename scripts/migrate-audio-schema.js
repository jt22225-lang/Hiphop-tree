#!/usr/bin/env node
// scripts/migrate-audio-schema.js
// One-shot migration: renames legacy audio fields to regional keys.
//
//   itunes_preview_url  → preview_url_gb  (was fetched with --country=GB default)
//   spotify_preview_url → preview_url_us  (Spotify URLs are globally accessible;
//                                          treat as US-primary since that catalog
//                                          tends to be the most complete)
//
// Fields preserved as-is: track_name, itunes_track_id, release_year, isrc, manual_audio
// Safe to re-run: already-migrated edges are skipped.

const fs   = require('fs');
const path = require('path');

const GRAPH_PATH = path.join(__dirname, '../hiphop-tree-backend/graph.json');

const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));

let migrated = 0, skipped = 0;

graph.relationships.forEach(r => {
  if (!r.audio_metadata) return;
  const m = r.audio_metadata;

  let changed = false;

  // itunes_preview_url → preview_url_gb
  if (m.itunes_preview_url && !m.preview_url_gb) {
    m.preview_url_gb = m.itunes_preview_url;
    delete m.itunes_preview_url;
    changed = true;
  }

  // spotify_preview_url → preview_url_us
  if (m.spotify_preview_url && !m.preview_url_us) {
    m.preview_url_us = m.spotify_preview_url;
    delete m.spotify_preview_url;
    changed = true;
  }

  if (changed) migrated++;
  else skipped++;
});

fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), 'utf8');

console.log(`Migration complete.`);
console.log(`  Migrated : ${migrated} edges`);
console.log(`  Skipped  : ${skipped} (already on new schema or no audio)`);
