#!/usr/bin/env node
// ── fetch-previews.js ─────────────────────────────────────────────────────────
// One-shot script: uses the Spotify Client Credentials flow to resolve
// preview URLs for the Sonic Link "Big Four" and patches graph.json in place.
//
// Usage:
//   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node fetch-previews.js
//
// Or: add SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET to your .env and run:
//   node -r dotenv/config fetch-previews.js
//
// Get credentials free at: https://developer.spotify.com/dashboard → Create App

const fs   = require('fs');
const path = require('path');

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌  Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET.');
  console.error('    Get them free at https://developer.spotify.com/dashboard');
  console.error('    Then run: SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node fetch-previews.js');
  process.exit(1);
}

// ── Track IDs for the Big Four ──────────────────────────────────────────────
// Spotify Track ID → relationship ID in graph.json
const TRACKS = [
  { relId: 'rel_007', spotifyId: '20owmiaX7OHb8dlGuvcgiX', name: 'Black Republican (Nas ft. Jay-Z)' },
  { relId: 'rel_003', spotifyId: '5jjAUXUCyOP6Ra0whgpwf4', name: 'Deep Cover (Dr. Dre ft. Snoop Dogg)' },
  { relId: 'rel_008', spotifyId: '68tMSdSRDuqPrNGxq3EVAW', name: 'The Motto (Lil Wayne ft. Drake)' },
  { relId: 'rel_ds34', spotifyId: '4gDCVQCoFt5bIhGy3eSIj8', name: 'The Whole World (Outkast ft. Killer Mike)' },
];

async function getSpotifyToken() {
  const creds    = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`Token fetch failed: ${response.status}`);
  const data = await response.json();
  return data.access_token;
}

async function getPreviewUrl(token, spotifyId) {
  const response = await fetch(`https://api.spotify.com/v1/tracks/${spotifyId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Track fetch failed for ${spotifyId}: ${response.status}`);
  const data = await response.json();
  return data.preview_url; // null if Spotify has no preview for this market
}

async function main() {
  console.log('🎵  Fetching Spotify token...');
  const token = await getSpotifyToken();
  console.log('✓   Token acquired\n');

  const graphPath = path.join(__dirname, 'graph.json');
  const graph     = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

  let updated = 0;
  for (const track of TRACKS) {
    process.stdout.write(`  Resolving: ${track.name}... `);
    try {
      const previewUrl = await getPreviewUrl(token, track.spotifyId);

      const rel = graph.relationships.find(r => r.id === track.relId);
      if (!rel) {
        console.log(`⚠   Relationship ${track.relId} not found in graph.json`);
        continue;
      }

      if (!previewUrl) {
        console.log('⚠   No preview available in this market (Spotify restriction)');
        // Keep existing URL so the player still shows something
        continue;
      }

      if (!rel.audio_metadata) rel.audio_metadata = {};
      rel.audio_metadata.spotify_preview_url = previewUrl;
      console.log(`✓   ${previewUrl.slice(0, 60)}...`);
      updated++;
    } catch (err) {
      console.log(`❌  Error: ${err.message}`);
    }
  }

  if (updated > 0) {
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf8');
    console.log(`\n✅  graph.json patched — ${updated} preview URL(s) updated.`);
    console.log('    Commit and push to deploy the real previews.');
  } else {
    console.log('\n⚠   No URLs were updated. Check errors above.');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
