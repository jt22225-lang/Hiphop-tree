#!/usr/bin/env node
/**
 * Quick test to verify Spotify credentials and token validity
 */

const CLIENT_ID = '139dde16c6974e3eb52ae4b753f8b3ce';
const CLIENT_SECRET = '5e07baa96d50459bb2e37eab2089f039';

async function test() {
  console.log('Testing Spotify credentials...\n');

  // 1. Test token fetch
  console.log('1️⃣  Getting access token...');
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  let tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenRes.ok) {
    console.log(`❌ Token fetch failed: ${tokenRes.status}`);
    const error = await tokenRes.text();
    console.log('Response:', error);
    return;
  }

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  console.log(`✅ Token acquired: ${token.substring(0, 20)}...\n`);

  // 2. Test search
  console.log('2️⃣  Testing artist search...');
  const searchRes = await fetch(
    `https://api.spotify.com/v1/search?q=jay-z&type=artist&limit=1`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  console.log(`   Status: ${searchRes.status}`);
  if (!searchRes.ok) {
    console.log(`❌ Search failed with status ${searchRes.status}`);
    const error = await searchRes.text();
    console.log('   Response:', error);
    return;
  }

  const data = await searchRes.json();
  console.log(`✅ Search successful`);
  console.log(`   Found: ${data.artists.items.length} artist(s)`);
  if (data.artists.items[0]) {
    const artist = data.artists.items[0];
    console.log(`   - ${artist.name} (${artist.id})`);
    console.log(`   - Images: ${artist.images.length}`);
  }
}

test().catch(err => console.error('Error:', err.message));
