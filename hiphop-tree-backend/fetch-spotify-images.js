#!/usr/bin/env node
/**
 * fetch-spotify-images.js
 *
 * Fetches artist images and IDs from Spotify API, updates graph.json in place.
 *
 * Usage:
 *   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node fetch-spotify-images.js
 *
 * Or add to .env and run:
 *   node -r dotenv/config fetch-spotify-images.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌  Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET.');
  console.error('    Get them free at https://developer.spotify.com/dashboard');
  console.error('    Then run: SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node fetch-spotify-images.js');
  process.exit(1);
}

// ── Get Spotify access token ────────────────────────────────────
async function getSpotifyToken() {
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`Token fetch failed: ${response.status}`);
  const data = await response.json();
  return data.access_token;
}

// ── Search for artist on Spotify ────────────────────────────────
async function searchArtistOnSpotify(token, artistName) {
  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!response.ok) throw new Error(`Search failed for "${artistName}": ${response.status}`);

  const data = await response.json();
  const artists = data.artists?.items || [];

  if (artists.length === 0) return null;

  const artist = artists[0];
  const imageUrl = artist.images?.[0]?.url || null;

  return {
    spotifyId: artist.id,
    imageUrl: imageUrl,
    popularity: artist.popularity,
  };
}

// ── Main script ────────────────────────────────────────────────
async function main() {
  console.log('🎵  Fetching Spotify token...');
  let token;
  try {
    token = await getSpotifyToken();
    console.log('✓   Token acquired\n');
  } catch (err) {
    console.error('❌  Failed to get token:', err.message);
    process.exit(1);
  }

  const graphPath = path.join(__dirname, 'graph.json');
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

  const results = {
    updated: 0,
    failed: 0,
    skipped: 0,
    artists: [],
  };

  console.log(`Processing ${graph.artists.length} artists...\n`);

  for (const artist of graph.artists) {
    try {
      process.stdout.write(`  ${artist.name}... `);

      const spotifyData = await searchArtistOnSpotify(token, artist.name);

      if (!spotifyData) {
        console.log('⚠   Not found on Spotify');
        results.failed++;
        results.artists.push({ name: artist.name, status: 'not-found' });
        continue;
      }

      // Check if we already have this data
      if (
        artist.metadata?.spotifyId === spotifyData.spotifyId &&
        artist.metadata?.imageUrl === spotifyData.imageUrl
      ) {
        console.log('✓   Already up-to-date');
        results.skipped++;
        results.artists.push({ name: artist.name, status: 'up-to-date' });
        continue;
      }

      // Update artist metadata
      if (!artist.metadata) artist.metadata = {};
      const prevImage = artist.metadata.imageUrl;
      artist.metadata.spotifyId = spotifyData.spotifyId;
      artist.metadata.imageUrl = spotifyData.imageUrl;

      console.log(`✓   ${spotifyData.imageUrl ? 'Image found' : 'No image'}`);
      results.updated++;
      results.artists.push({
        name: artist.name,
        status: 'updated',
        imageUrl: spotifyData.imageUrl,
        wasEmpty: !prevImage,
      });
    } catch (err) {
      console.log(`❌  Error: ${err.message}`);
      results.failed++;
      results.artists.push({ name: artist.name, status: 'error', error: err.message });
    }

    // Polite rate limiting between Spotify requests
    await new Promise(r => setTimeout(r, 300));
  }

  // Save updated graph
  if (results.updated > 0) {
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf8');
  }

  // ── Print report ──────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('📊  SPOTIFY IMAGE FETCH REPORT');
  console.log('='.repeat(70));
  console.log(`\n✅  Updated:    ${results.updated} artists`);
  console.log(`⚠   Failed:     ${results.failed} artists`);
  console.log(`→   Skipped:    ${results.skipped} artists (already cached)`);
  console.log(`\nTotal: ${results.updated + results.failed + results.skipped}/${graph.artists.length}\n`);

  if (results.updated > 0) {
    console.log('UPDATED ARTISTS:');
    results.artists
      .filter(r => r.status === 'updated')
      .forEach(r => {
        const status = r.wasEmpty ? '[NEW]' : '[REFRESHED]';
        console.log(`  ${status} ${r.name}`);
        if (r.imageUrl) console.log(`       └─ ${r.imageUrl.slice(0, 70)}...`);
      });
  }

  if (results.failed > 0) {
    console.log('\nNOT FOUND ON SPOTIFY:');
    results.artists
      .filter(r => r.status === 'not-found')
      .forEach(r => console.log(`  ✗ ${r.name}`));
  }

  console.log('\n' + '='.repeat(70));

  if (results.updated > 0) {
    console.log(`\n✨  graph.json patched with ${results.updated} Spotify image(s).`);
    console.log('    Commit and push to deploy.\n');
  } else {
    console.log('\nℹ   No updates needed.\n');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
