require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const graphData = require('./graph.json');

const app = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health Check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    artists: graphData.artists.length,
    relationships: graphData.relationships.length,
  });
});

// ── GET /api/graph ──────────────────────────────────────────
// Returns the full graph (all artists + relationships)
app.get('/api/graph', (req, res) => {
  res.json(graphData);
});

// ── GET /api/search?q=<query> ───────────────────────────────
// Search artists by name
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);

  const results = graphData.artists.filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.id.toLowerCase().includes(q)
  );
  res.json(results);
});

// ── GET /api/artist/:id ─────────────────────────────────────
// Get a single artist + all their connections
app.get('/api/artist/:id', (req, res) => {
  const artist = graphData.artists.find(a => a.id === req.params.id);
  if (!artist) return res.status(404).json({ error: 'Artist not found' });

  const connections = graphData.relationships.filter(
    r => r.source === artist.id || r.target === artist.id
  );

  res.json({ artist, connections });
});

// ── GET /api/verify/genius?artist1=X&artist2=Y ──────────────
// Search Genius API for evidence of collaboration
app.get('/api/verify/genius', async (req, res) => {
  const { artist1, artist2 } = req.query;
  if (!artist1 || !artist2) {
    return res.status(400).json({ error: 'Provide artist1 and artist2 query params' });
  }

  const apiKey = process.env.GENIUS_API_KEY;
  if (!apiKey || apiKey === 'your_genius_access_token_here') {
    return res.status(503).json({ error: 'Genius API key not configured' });
  }

  try {
    const query = `${artist1} ${artist2}`;
    const response = await axios.get('https://api.genius.com/search', {
      params: { q: query },
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const hits = response.data.response.hits.slice(0, 5).map(h => ({
      title: h.result.full_title,
      url: h.result.url,
      thumbnail: h.result.song_art_image_thumbnail_url,
    }));

    res.json({ query, results: hits });
  } catch (err) {
    console.error('Genius API error:', err.message);
    res.status(500).json({ error: 'Failed to reach Genius API' });
  }
});

// ── GET /api/genius/artist/:name ───────────────────────────
// Fetch full artist profile + about/bio from Genius
app.get('/api/genius/artist/:name', async (req, res) => {
  const apiKey = process.env.GENIUS_API_KEY;
  if (!apiKey || apiKey === 'your_genius_access_token_here') {
    return res.status(503).json({ error: 'Genius API key not configured' });
  }

  const headers = { Authorization: `Bearer ${apiKey}` };
  const name = decodeURIComponent(req.params.name);

  try {
    // Step 1: search for the artist to get their Genius ID
    const searchRes = await axios.get('https://api.genius.com/search', {
      params: { q: name },
      headers,
    });

    const hit = searchRes.data.response.hits.find(
      h => h.result.primary_artist.name.toLowerCase().includes(name.toLowerCase())
    ) || searchRes.data.response.hits[0];

    if (!hit) return res.status(404).json({ error: 'Artist not found on Genius' });

    const artistId = hit.result.primary_artist.id;

    // Step 2: fetch full artist profile (includes description/about)
    const artistRes = await axios.get(`https://api.genius.com/artists/${artistId}`, {
      params: { text_format: 'plain' },
      headers,
    });

    const a = artistRes.data.response.artist;
    res.json({
      name:        a.name,
      image:       a.image_url,
      headerImage: a.header_image_url,
      url:         a.url,
      followers:   a.followers_count,
      about:       a.description?.plain || null,
      verified:    a.is_verified,
    });
  } catch (err) {
    console.error('Genius artist fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch artist from Genius' });
  }
});

// ── GET /api/path?from=X&to=Y ───────────────────────────────
// Find shortest connection path between two artists (BFS)
app.get('/api/path', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Provide from and to query params' });

  const adjMap = {};
  graphData.artists.forEach(a => { adjMap[a.id] = []; });
  graphData.relationships.forEach(r => {
    adjMap[r.source]?.push({ id: r.target, rel: r });
    adjMap[r.target]?.push({ id: r.source, rel: r });
  });

  // BFS
  const visited = new Set([from]);
  const queue = [[from, []]];

  while (queue.length) {
    const [current, path] = queue.shift();
    if (current === to) return res.json({ path, hops: path.length });

    for (const neighbor of (adjMap[current] || [])) {
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        queue.push([neighbor.id, [...path, { from: current, to: neighbor.id, rel: neighbor.rel }]]);
      }
    }
  }

  res.json({ path: null, message: 'No connection found' });
});

// ── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎤 HipHopTree backend running on http://localhost:${PORT}`);
  console.log(`   Health:  http://localhost:${PORT}/health`);
  console.log(`   Graph:   http://localhost:${PORT}/api/graph`);
  console.log(`   Search:  http://localhost:${PORT}/api/search?q=kendrick\n`);
});
