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

// ── GET /api/wiki-image/:name ───────────────────────────────
// Fetch artist image from Wikipedia (no API key needed)
app.get('/api/wiki-image/:name', async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const response = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action:      'query',
        titles:      name,
        prop:        'pageimages|pageterms',
        format:      'json',
        pithumbsize: 300,
        origin:      '*',
      },
      headers: {
        'User-Agent': 'HipHopTree/1.0 (https://hiphoptree.com) Node.js',
        'Accept':     'application/json',
      },
      timeout: 10000,
    });

    const pages = response.data?.query?.pages;
    if (!pages) {
      console.log(`[WIKI] No pages in response for: ${name}`);
      return res.status(404).json({ error: 'No Wikipedia page found' });
    }

    const page = Object.values(pages)[0];
    if (!page || !page.thumbnail) {
      console.log(`[WIKI] No thumbnail for: ${name} (pageId: ${page?.pageid})`);
      return res.status(404).json({ error: 'No image found on Wikipedia' });
    }

    console.log(`[WIKI] ✅ Found image for: ${name}`);
    res.json({ name, image: page.thumbnail.source });
  } catch (err) {
    console.error(`[WIKI] Error for "${name}":`, err.message);
    res.status(500).json({ error: 'Failed to fetch from Wikipedia', detail: err.message });
  }
});

// ── Wikidata helpers ────────────────────────────────────────
const SPARQL = 'https://query.wikidata.org/sparql';
const WD_HEADERS = {
  'User-Agent': 'HipHopTree/1.0 (https://hiphoptree.com) Node.js',
  'Accept':     'application/sparql-results+json',
};

async function getWikidataId(name) {
  const res = await axios.get('https://www.wikidata.org/w/api.php', {
    params: { action:'wbsearchentities', search:name, language:'en', format:'json', limit:5, type:'item' },
    headers: { 'User-Agent': 'HipHopTree/1.0' },
    timeout: 8000,
  });
  return res.data.search?.[0]?.id || null;
}

async function sparqlQuery(query) {
  const res = await axios.get(SPARQL, {
    params: { query, format:'json' },
    headers: WD_HEADERS,
    timeout: 12000,
  });
  return res.data.results.bindings;
}

// ── GET /api/wikidata/artist/:name ──────────────────────────
// Returns family ties, influences, collective memberships, hometown
app.get('/api/wikidata/artist/:name', async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const qid = await getWikidataId(name);
    if (!qid) return res.status(404).json({ error: `No Wikidata entry for "${name}"` });

    // Each property queried separately so the label service works reliably
    const PROPS = [
      { claim: 'P1038', key: 'relative'     },
      { claim: 'P40',   key: 'child'        },
      { claim: 'P22',   key: 'father'       },
      { claim: 'P25',   key: 'mother'       },
      { claim: 'P26',   key: 'spouse'       },
      { claim: 'P737',  key: 'influenced_by'},
      { claim: 'P463',  key: 'member_of'    },
      { claim: 'P19',   key: 'hometown'     },
      { claim: 'P264',  key: 'record_label' },
      { claim: 'P136',  key: 'genre'        },
    ];

    const claimList = PROPS.map(p => `wdt:${p.claim}`).join(' ');
    const query = `
      SELECT ?claim ?value ?valueLabel WHERE {
        VALUES ?claim { ${claimList} }
        wd:${qid} ?claim ?value .
        SERVICE wikibase:label {
          bd:serviceParam wikibase:language "en,en" .
          ?value rdfs:label ?valueLabel .
        }
      }
    `;

    const bindings = await sparqlQuery(query);

    // Build a URI → key map for grouping
    const claimToKey = {};
    PROPS.forEach(p => {
      claimToKey[`http://www.wikidata.org/prop/direct/${p.claim}`] = p.key;
    });

    const grouped = {};
    bindings.forEach(b => {
      const claimUri = b.claim.value;
      const key      = claimToKey[claimUri];
      if (!key) return;
      const val = b.valueLabel?.value || b.value.value;
      const uri = b.value.value;
      // Skip raw QIDs (no label found) and duplicate entries
      if (val.startsWith('Q') && /^Q\d+$/.test(val)) return;
      if (!grouped[key]) grouped[key] = [];
      if (!grouped[key].find(x => x.name === val)) {
        grouped[key].push({ name: val, uri });
      }
    });

    console.log(`[WD] ✅ ${name} (${qid}):`, Object.keys(grouped).join(', ') || 'no data');
    res.json({ name, qid, wikidataUrl: `https://www.wikidata.org/wiki/${qid}`, ...grouped });

  } catch (err) {
    console.error(`[WD] Error for "${name}":`, err.message);
    res.status(500).json({ error: 'Wikidata query failed', detail: err.message });
  }
});

// ── GET /api/wikidata/collective/:name ──────────────────────
// Returns all members of a collective/group from Wikidata
app.get('/api/wikidata/collective/:name', async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const query = `
      SELECT ?memberLabel ?member WHERE {
        ?group rdfs:label "${name}"@en .
        ?member wdt:P463 ?group .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    `;
    const bindings = await sparqlQuery(query);
    const members = bindings.map(b => ({
      name: b.memberLabel?.value,
      uri:  b.member.value,
    })).filter(m => m.name && !m.name.startsWith('Q'));

    console.log(`[WD] Collective "${name}": ${members.length} members`);
    res.json({ collective: name, members });
  } catch (err) {
    console.error(`[WD] Collective error:`, err.message);
    res.status(500).json({ error: 'Wikidata collective query failed' });
  }
});

// ── GET /api/proxy-image?url=<encoded> ─────────────────────
// Proxies external images through the backend to avoid CORS issues
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No url provided' });
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer':    'https://en.wikipedia.org/',
        'Accept':     'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      timeout: 10000,
    });
    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch image' });
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
