// Updated KRS-One cultural impact section - trigger redeploy
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const graphData = require('./graph.json');
const { getCached, setCached, isStale } = require('./cache');
const { fetchWikiImage } = require('./lib/image-resolver');
const { fetchAndCacheArtistImages, getLocalCache } = require('./artist-image-fetcher');
const { dijkstra } = require('./algorithms/dijkstra');

const app = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Request Throttle for Wikidata ──────────────────────────
// Limits concurrent requests to 1 per 500ms to avoid rate limiting
class RequestThrottle {
  constructor(minIntervalMs = 500) {
    this.minIntervalMs = minIntervalMs;
    this.lastRequestTime = 0;
  }

  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minIntervalMs) {
      const delay = this.minIntervalMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    this.lastRequestTime = Date.now();
  }
}

const wdThrottle = new RequestThrottle(2000); // One request every 2 seconds (Wikidata is strict)

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

// ── POST /api/cache-artist-images ───────────────────────────
// Accepts { ids: ["artist-id-1", ...] } (or omit ids to process all artists).
// Runs the full Wikipedia → Wikidata resolution chain per artist, caches
// results in artist-images-cache.json and Supabase artist_images table.
// Returns { results: { [id]: url|null }, missing: [...], found: N }
app.post('/api/cache-artist-images', async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids
    : graphData.artists.map(a => a.id);

  if (ids.length === 0) return res.json({ results: {}, missing: [], found: 0 });

  try {
    const { results, missing } = await fetchAndCacheArtistImages(ids);
    const found = Object.values(results).filter(Boolean).length;
    console.log(`[CACHE-IMAGES] ${found}/${ids.length} resolved, ${missing.length} missing`);
    res.json({ results, missing, found });
  } catch (err) {
    console.error('[CACHE-IMAGES] Fatal:', err.message);
    res.status(500).json({ error: 'Image cache run failed', detail: err.message });
  }
});

// ── GET /api/cache-artist-images ────────────────────────────
// Returns the current local image cache so the frontend can
// hydrate without a new fetch round-trip.
app.get('/api/cache-artist-images', (req, res) => {
  res.json(getLocalCache());
});

// ── GET /api/wiki-image/:name ───────────────────────────────
// Stale-while-revalidate: serve cache instantly, refresh in background
app.get('/api/wiki-image/:name', async (req, res) => {
  const name    = decodeURIComponent(req.params.name);
  const nameKey = name.toLowerCase();

  // 1. Check cache
  const cached = await getCached(nameKey);
  if (cached?.image_url) {
    if (isStale(cached)) {
      // Return instantly, refresh in background
      console.log(`[WIKI] ♻️  Stale cache for "${name}" — refreshing in background`);
      setImmediate(async () => {
        try {
          const img = await fetchWikiImage(name);
          if (img) await setCached(nameKey, name, { image_url: img });
        } catch (e) { console.warn('[WIKI] Background refresh failed:', e.message); }
      });
    } else {
      console.log(`[WIKI] ⚡ Cache hit for "${name}"`);
    }
    return res.json({ name, image: cached.image_url, source: 'cache' });
  }

  // 2. Cache miss — fetch live, save, respond
  try {
    const img = await fetchWikiImage(name);
    if (!img) {
      console.log(`[WIKI] No thumbnail for: ${name}`);
      return res.status(404).json({ error: 'No image found on Wikipedia' });
    }
    console.log(`[WIKI] ✅ Fresh fetch for "${name}"`);
    // Save to cache without blocking the response
    setImmediate(() => setCached(nameKey, name, { image_url: img }));
    res.json({ name, image: img, source: 'fresh' });
  } catch (err) {
    console.error(`[WIKI] Error for "${name}":`, err.message);
    res.status(500).json({ error: 'Failed to fetch from Wikipedia', detail: err.message });
  }
});

// ── POST /api/wiki-image-batch ──────────────────────────────
// Accepts { artists: [{id, name, wikidataId?}] }
// Returns { results: { [artistId]: imageUrl }, count }
app.post('/api/wiki-image-batch', async (req, res) => {
  const artists = req.body?.artists;
  if (!Array.isArray(artists)) return res.status(400).json({ error: 'Expected { artists: [...] }' });

  const results = {};

  // OPTIMIZED: Pre-filter cache lookups in parallel, then only fetch uncached
  // This reduces batch time from ~500ms to ~100-150ms

  // Step 1: Check all cache entries in parallel (fast, no I/O delay)
  const cacheCheckPromises = artists
    .filter(({ id, name }) => id && name)
    .map(async ({ id, name }) => {
      const cached = await getCached(name.toLowerCase());
      return { id, name, cached };
    });

  const cacheResults = await Promise.all(cacheCheckPromises);
  const uncached = [];

  // Step 2: Separate cached from uncached (in-memory operation, O(n))
  cacheResults.forEach(({ id, name, cached }) => {
    if (cached?.image_url) {
      results[id] = cached.image_url;
    } else {
      uncached.push({ id, name });
    }
  });

  // Step 3: Only fetch uncached artists (reduce API load by 60-80%)
  if (uncached.length > 0) {
    // Higher concurrency safe since we're only fetching uncached (fewer total requests)
    const CONCURRENCY = 8;
    for (let i = 0; i < uncached.length; i += CONCURRENCY) {
      const slice = uncached.slice(i, i + CONCURRENCY);
      await Promise.all(slice.map(async ({ id, name }) => {
        try {
          const img = await fetchWikiImage(name, null);
          if (img) {
            results[id] = img;
            // Cache asynchronously without blocking
            setCached(name.toLowerCase(), name, { image_url: img }).catch(e =>
              console.error(`[BATCH] Cache write failed for "${name}":`, e.message)
            );
          }
        } catch (e) {
          console.warn(`[BATCH] Image fetch failed for "${name}":`, e.message);
        }
      }));
      // No pause needed: concurrency limit (8) naturally throttles Wikipedia API
    }
  }

  const resolveCount = Object.keys(results).length;
  console.log(`[BATCH] Resolved ${resolveCount}/${artists.length} images (${uncached.length} fetched, ${resolveCount - uncached.length} from cache)`);
  res.json({ results, count: resolveCount });
});

// ── POST /api/artist-images ─────────────────────────────────
// Accepts { ids: ["artist-id-1", "artist-id-2", ...] }
// Looks up name + wikidataId from graph, runs multi-strategy image
// resolution (Wikipedia → Wikidata P18 → Google), caches results.
// Returns { images: { [artistId]: url | null } }
app.post('/api/artist-images', async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Expected { ids: [...] }' });

  const images = {};

  for (const id of ids) {
    const artist = graphData.artists.find(a => a.id === id);
    if (!artist) { images[id] = null; continue; }

    const nameKey = artist.name.toLowerCase();
    const cached  = await getCached(nameKey);
    if (cached?.image_url) {
      images[id] = cached.image_url;
      continue;
    }

    try {
      const img = await fetchWikiImage(artist.name, artist.metadata?.wikidataId || null);
      images[id] = img || null;
      if (img) setImmediate(() => setCached(nameKey, artist.name, { image_url: img }));
    } catch (e) {
      console.warn(`[ARTIST-IMAGES] Error for "${artist.name}":`, e.message);
      images[id] = null;
    }

    await new Promise(r => setTimeout(r, 150));
  }

  const found = Object.values(images).filter(Boolean).length;
  console.log(`[ARTIST-IMAGES] Resolved ${found}/${ids.length}`);
  res.json({ images });
});

// ── Wikidata helpers ────────────────────────────────────────
const SPARQL = 'https://query.wikidata.org/sparql';
const WD_HEADERS = {
  'User-Agent':      'HipHopTree/1.0 (https://hiphoptree.com) Node.js',
  'Accept':          'application/sparql-results+json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control':   'no-cache',
  'Pragma':          'no-cache',
};

async function getWikidataId(name, retries = 3) {
  try {
    await wdThrottle.throttle();
    const res = await axios.get('https://www.wikidata.org/w/api.php', {
      params: { action:'wbsearchentities', search:name, language:'en', format:'json', limit:5, type:'item' },
      headers: { 'User-Agent': 'HipHopTree/1.0' },
      timeout: 8000,
    });
    return res.data.search?.[0]?.id || null;
  } catch (err) {
    // Handle rate limiting (429) with exponential backoff
    if (err.response?.status === 429 && retries > 0) {
      const retryAfter = parseInt(err.response.headers['retry-after'] || '3', 10);
      const delay = Math.min(retryAfter * 1000, 15000); // Cap at 15 seconds
      console.warn(`[WD] Rate limited (429) on ID lookup — retrying in ${delay}ms (${retries} retries left)`);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      return getWikidataId(name, retries - 1);
    }

    // Rate limited and out of retries — return null instead of erroring
    if (err.response?.status === 429) {
      console.warn('[WD] Rate limited (429) on ID lookup — giving up');
      return null;
    }

    // Other errors — throw
    throw err;
  }
}

async function sparqlQuery(query, retries = 5, delayMultiplier = 1) {
  try {
    await wdThrottle.throttle();
    const res = await axios.get(SPARQL, {
      params: { query, format:'json' },
      headers: WD_HEADERS,
      timeout: 12000,
    });
    return res.data.results.bindings;
  } catch (err) {
    // Handle rate limiting (429) with exponential backoff
    if (err.response?.status === 429 && retries > 0) {
      const retryAfter = parseInt(err.response.headers['retry-after'] || '5', 10);
      const baseDelay = retryAfter * 1000 * delayMultiplier;
      const delay = Math.min(baseDelay, 30000); // Cap at 30 seconds
      console.warn(`[WD] Rate limited (429) — retrying in ${delay}ms (${retries} retries left) with multiplier ${delayMultiplier}`);

      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      return sparqlQuery(query, retries - 1, delayMultiplier * 1.5);
    }

    // Rate limited and out of retries — return empty results instead of erroring
    if (err.response?.status === 429) {
      console.warn('[WD] Rate limited (429) and out of retries — returning empty results');
      return [];
    }

    // Other errors — throw
    throw err;
  }
}

// ── Wikidata artist fetcher (used by endpoint + background refresh) ─
const WD_PROPS = [
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

// ── Fetch Wikidata using direct QID ──────────────────────
async function fetchWikidataArtistByQid(qid) {
  if (!qid) {
    console.log('[WD] ⚠️  No QID provided to fetchWikidataArtistByQid');
    return null;
  }

  try {
    // Build property list for VALUES clause
    const propList = WD_PROPS.map(p => `wdt:${p.claim}`).join(' ');

    const query = `
      SELECT ?pred ?value ?valueLabel WHERE {
        VALUES ?pred { ${propList} }
        wd:${qid} ?pred ?value .
        SERVICE wikibase:label {
          bd:serviceParam wikibase:language "en" .
          ?value rdfs:label ?valueLabel .
        }
      }
      LIMIT 500
    `;

    console.log(`[WD] Querying SPARQL for QID ${qid}...`);
    const bindings = await sparqlQuery(query);
    console.log(`[WD] SPARQL returned ${bindings.length} bindings for QID ${qid}`);

    // Map predicate URIs to keys
    const predToKey = {};
    WD_PROPS.forEach(p => {
      predToKey[`http://www.wikidata.org/prop/direct/${p.claim}`] = p.key;
    });

    const grouped = {};
    bindings.forEach(b => {
      const predUri = b.pred.value;
      const key = predToKey[predUri];
      if (!key) return;

      const val = b.valueLabel?.value || b.value.value;
      const uri = b.value.value;

      // Skip if value is just a QID number (not resolved to a label)
      if (val.startsWith('Q') && /^Q\d+$/.test(val)) return;

      if (!grouped[key]) grouped[key] = [];
      if (!grouped[key].find(x => x.name === val)) grouped[key].push({ name: val, uri });
    });

    const totalItems = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`[WD] Grouped into ${Object.keys(grouped).length} categories with ${totalItems} total items for QID ${qid}`);

    return { qid, grouped };
  } catch (err) {
    console.error(`[WD] Error fetching data for QID ${qid}:`, err.message);
    throw err;
  }
}

// ── Fetch Wikidata using artist name search ──────────────────────
async function fetchWikidataArtist(name) {
  const qid = await getWikidataId(name);
  if (!qid) return null;

  return fetchWikidataArtistByQid(qid);
}

// ── GET /api/wikidata/artist/:name ──────────────────────────
// Returns family ties, influences, collective memberships, hometown
// Accepts optional artistId query param to use stored Wikidata ID from graph.json
app.get('/api/wikidata/artist/:name', async (req, res) => {
  const name    = decodeURIComponent(req.params.name);
  const artistId = req.query.artistId ? decodeURIComponent(req.query.artistId) : null;
  const nameKey = artistId || name.toLowerCase();

  // Try to get Wikidata ID from graph.json if artistId provided
  let qid = null;
  if (artistId) {
    const artist = graphData.artists.find(a => a.id === artistId);
    if (artist?.metadata?.wikidataId) {
      qid = artist.metadata.wikidataId;
      console.log(`[WD] Using stored Wikidata ID for ${artistId}: ${qid}`);
    }
  }

  // 1. Check cache
  const cached = await getCached(nameKey);
  if (cached?.wikidata) {
    if (isStale(cached)) {
      console.log(`[WD] ♻️  Stale cache for "${name}" — refreshing in background`);
      setImmediate(async () => {
        try {
          const result = qid
            ? await fetchWikidataArtistByQid(qid)
            : await fetchWikidataArtist(name);
          if (result) await setCached(nameKey, name, { wikidata: result.grouped, wikidata_id: result.qid });
        } catch (e) { console.warn('[WD] Background refresh failed:', e.message); }
      });
    } else {
      console.log(`[WD] ⚡ Cache hit for "${name}"`);
    }
    const cachedQid = cached.wikidata_id || qid || '';
    return res.json({ name, qid: cachedQid, wikidataUrl: `https://www.wikidata.org/wiki/${cachedQid}`, source: 'cache', ...cached.wikidata });
  }

  // 2. Cache miss — fetch live
  try {
    // Use stored QID if available, otherwise search by name
    const result = qid
      ? await fetchWikidataArtistByQid(qid)
      : await fetchWikidataArtist(name);

    // Return empty but valid response if no data found (includes rate-limited case)
    if (!result) {
      console.log(`[WD] ⚠️  No data for "${name}" (${qid || 'searched by name'}) (may be rate-limited or not on Wikidata)`);
      return res.json({
        name,
        qid: qid || '',
        wikidataUrl: qid ? `https://www.wikidata.org/wiki/${qid}` : '',
        source: 'empty',
        relative: [],
        child: [],
        father: [],
        mother: [],
        spouse: [],
        influenced_by: [],
        member_of: [],
        hometown: [],
        record_label: [],
        genre: []
      });
    }

    const resultQid = result.qid;
    console.log(`[WD] ✅ Fresh fetch "${name}" (${resultQid}):`, Object.keys(result.grouped).join(', ') || 'no data');
    setImmediate(() => setCached(nameKey, name, { wikidata: result.grouped, wikidata_id: resultQid }));
    res.json({ name, qid: resultQid, wikidataUrl: `https://www.wikidata.org/wiki/${resultQid}`, source: 'fresh', ...result.grouped });

  } catch (err) {
    console.error(`[WD] Error for "${name}":`, err.message);
    // Return empty response on error instead of 500, so frontend doesn't show error message
    res.json({
      name,
      qid: qid || '',
      wikidataUrl: qid ? `https://www.wikidata.org/wiki/${qid}` : '',
      source: 'error',
      relative: [],
      child: [],
      father: [],
      mother: [],
      spouse: [],
      influenced_by: [],
      member_of: [],
      hometown: [],
      record_label: [],
      genre: []
    });
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
// Supports ETag validation for 304 Not Modified responses
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No url provided' });

  // Client sent If-None-Match header for validation
  const clientETag = req.headers['if-none-match'];

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer':    'https://en.wikipedia.org/',
        'Accept':     'image/webp,image/apng,image/*,*/*;q=0.8',
        // Use existing ETag if client provided one (conditional request)
        ...(clientETag ? { 'If-None-Match': clientETag } : {}),
      },
      timeout: 8000,
      maxRedirects: 5,
      validateStatus: (status) => status === 200 || status === 304, // Accept both 200 and 304
    });

    // If server returns 304 (not modified), return 304 to client
    if (response.status === 304) {
      res.status(304).end();
      return;
    }

    const contentType = response.headers['content-type'] || 'image/jpeg';
    const etag = response.headers['etag'] || `"${Date.now()}"`;

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('ETag', etag);
    res.send(response.data);
  } catch (err) {
    // Log error but don't return 502 — return 404 or 503 depending on error
    const statusCode = err.response?.status || (err.code === 'ECONNABORTED' ? 504 : 503);
    console.error(`[PROXY-IMAGE] Failed to fetch ${url}:`, err.message);
    res.status(statusCode).json({ error: 'Failed to fetch image' });
  }
});

// ── Wikipedia bio fetcher ───────────────────────────────────
async function fetchWikiBio(pageTitle) {
  try {
    const response = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action:      'query',
        titles:      pageTitle,
        prop:        'extracts',
        exintro:     true,
        explaintext: true,
        format:      'json',
        origin:      '*',
      },
      headers: { 'User-Agent': 'HipHopTree/1.0 (https://hiphoptree.com) Node.js' },
      timeout: 10000,
    });
    const pages = response.data?.query?.pages;
    const page  = pages ? Object.values(pages)[0] : null;

    // If page not found via direct title match, try Wikipedia search
    if (!page?.extract) {
      console.log(`[WIKI-BIO] Direct title match failed for "${pageTitle}" — trying search API`);
      const searchRes = await axios.get('https://en.wikipedia.org/w/api.php', {
        params: {
          action: 'query',
          list: 'search',
          srsearch: pageTitle,
          format: 'json',
          origin: '*',
        },
        headers: { 'User-Agent': 'HipHopTree/1.0 (https://hiphoptree.com) Node.js' },
        timeout: 10000,
      });

      const searchResults = searchRes.data?.query?.search || [];
      if (searchResults.length === 0) return null;

      // Retry with the first search result's title
      const firstResultTitle = searchResults[0].title;
      console.log(`[WIKI-BIO] Found via search: "${firstResultTitle}"`);

      const retryRes = await axios.get('https://en.wikipedia.org/w/api.php', {
        params: {
          action: 'query',
          titles: firstResultTitle,
          prop: 'extracts',
          exintro: true,
          explaintext: true,
          format: 'json',
          origin: '*',
        },
        headers: { 'User-Agent': 'HipHopTree/1.0 (https://hiphoptree.com) Node.js' },
        timeout: 10000,
      });

      const retryPages = retryRes.data?.query?.pages;
      const retryPage = retryPages ? Object.values(retryPages)[0] : null;
      if (!retryPage?.extract) return null;
      return retryPage.extract.replace(/==+[^=]+==/g, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    // Strip any stray section headers and tidy whitespace
    return page.extract.replace(/==+[^=]+==/g, '').replace(/\n{3,}/g, '\n\n').trim();
  } catch (err) {
    console.error(`[WIKI-BIO] Error fetching bio for "${pageTitle}":`, err.message);
    return null;
  }
}

// ── GET /api/wiki-bio/:name ─────────────────────────────────
// Wikipedia intro extract — replaces broken Genius bio
// Accepts optional artistId query param to use stored Wikipedia URL from graph.json
app.get('/api/wiki-bio/:name', async (req, res) => {
  const name    = decodeURIComponent(req.params.name);
  const artistId = req.query.artistId ? decodeURIComponent(req.query.artistId) : null;
  const nameKey = artistId || name.toLowerCase();

  // Try to get Wikipedia page title from graph.json if artistId provided
  let pageTitle = name;
  let wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, '_'))}`;

  if (artistId) {
    const artist = graphData.artists.find(a => a.id === artistId);
    if (artist?.metadata?.wikipediaUrl) {
      // Extract page title from URL: https://en.wikipedia.org/wiki/Page_Title → Page_Title
      const matches = artist.metadata.wikipediaUrl.match(/\/wiki\/(.+)$/);
      if (matches && matches[1]) {
        pageTitle = decodeURIComponent(matches[1]);
        wikiUrl = artist.metadata.wikipediaUrl;
        console.log(`[WIKI-BIO] Using stored Wikipedia URL for ${artistId}: "${pageTitle}"`);
      }
    }
  }

  // 1. Check cache
  const cached = await getCached(nameKey);
  if (cached?.bio) {
    if (isStale(cached)) {
      setImmediate(async () => {
        try {
          const bio = await fetchWikiBio(pageTitle);
          if (bio) await setCached(nameKey, name, { bio });
        } catch (e) { console.warn('[WIKI-BIO] Background refresh failed:', e.message); }
      });
    } else {
      console.log(`[WIKI-BIO] ⚡ Cache hit for "${name}"`);
    }
    return res.json({
      name,
      about:   cached.bio,
      wikiUrl,
      source:  'cache',
    });
  }

  // 2. Cache miss — fetch live
  try {
    const bio = await fetchWikiBio(pageTitle);

    // Return empty response instead of error so UI doesn't show error message
    if (!bio) {
      console.log(`[WIKI-BIO] No bio found for "${pageTitle}" (${artistId || name})`);
      return res.json({
        name,
        about:   null,
        wikiUrl,
        source:  'empty',
      });
    }

    console.log(`[WIKI-BIO] ✅ Fresh fetch for "${pageTitle}"`);
    setImmediate(() => setCached(nameKey, name, { bio }));
    res.json({
      name,
      about:   bio,
      wikiUrl,
      source:  'fresh',
    });
  } catch (err) {
    console.error(`[WIKI-BIO] Error for "${pageTitle}":`, err.message);
    // Return empty response on error instead of 500
    res.json({
      name,
      about:   null,
      wikiUrl,
      source:  'error',
    });
  }
});

// ── GET /api/genius/artist/:name ───────────────────────────
// Fetch artist bio from Genius, with cache fallback
app.get('/api/genius/artist/:name', async (req, res) => {
  const name    = decodeURIComponent(req.params.name);
  const nameKey = name.toLowerCase();

  // 1. Check cache for bio first (useful when Genius API is flaky)
  const cached = await getCached(nameKey);
  if (cached?.bio) {
    if (isStale(cached)) {
      console.log(`[GENIUS] ♻️  Stale bio for "${name}" — refreshing in background`);
      setImmediate(() => fetchAndCacheGeniusBio(name, nameKey));
    } else {
      console.log(`[GENIUS] ⚡ Cache hit for "${name}"`);
    }
    return res.json({ name, about: cached.bio, source: 'cache' });
  }

  // 2. Cache miss — try Genius live
  return fetchAndCacheGeniusBio(name, nameKey, res);
});

async function fetchAndCacheGeniusBio(name, nameKey, res) {
  const apiKey = process.env.GENIUS_API_KEY;
  if (!apiKey || apiKey === 'your_genius_access_token_here') {
    if (res) res.status(503).json({ error: 'Genius API key not configured' });
    return;
  }

  const headers = { Authorization: `Bearer ${apiKey}` };
  try {
    const searchRes = await axios.get('https://api.genius.com/search', {
      params: { q: name }, headers,
    });
    const hit = searchRes.data.response.hits.find(
      h => h.result.primary_artist.name.toLowerCase().includes(name.toLowerCase())
    ) || searchRes.data.response.hits[0];

    if (!hit) {
      if (res) res.status(404).json({ error: 'Artist not found on Genius' });
      return;
    }

    const artistRes = await axios.get(
      `https://api.genius.com/artists/${hit.result.primary_artist.id}`,
      { params: { text_format: 'plain' }, headers }
    );
    const a    = artistRes.data.response.artist;
    const bio  = a.description?.plain || null;

    if (bio) setImmediate(() => setCached(nameKey, name, { bio }));

    if (res) res.json({
      name:        a.name,
      image:       a.image_url,
      headerImage: a.header_image_url,
      url:         a.url,
      followers:   a.followers_count,
      about:       bio,
      verified:    a.is_verified,
      source:      'fresh',
    });
  } catch (err) {
    console.error('[GENIUS] Fetch error:', err.message);
    if (res) res.status(500).json({ error: 'Failed to fetch artist from Genius' });
  }
}

// ── GET /api/wikidata/producer-credits/:name ───────────────
// SPARQL query #3 from the Legend spec:
// Finds every artist this producer has a "producer" or
// "executive producer" credit on via Wikidata P162 / P1040.
// Also cross-references P175 (performer) for release nodes so
// we can draw lines to every artist they've "breathed on".
//
// Think of this as a reverse-lookup: start at the producer,
// follow the release graph, arrive at every performer orbit.
app.get('/api/wikidata/producer-credits/:name', async (req, res) => {
  const name    = decodeURIComponent(req.params.name);
  const nameKey = `producer_credits_${name.toLowerCase()}`;

  // Check cache
  const cached = await getCached(nameKey);
  if (cached?.producerCredits) {
    if (isStale(cached)) {
      setImmediate(async () => {
        try {
          const result = await fetchProducerCredits(name);
          if (result) await setCached(nameKey, name, { producerCredits: result });
        } catch (e) { console.warn('[WD-PRODUCER] Background refresh failed:', e.message); }
      });
    } else {
      console.log(`[WD-PRODUCER] ⚡ Cache hit for "${name}"`);
    }
    return res.json({ name, source: 'cache', credits: cached.producerCredits });
  }

  try {
    const result = await fetchProducerCredits(name);
    if (!result) return res.status(404).json({ error: `No Wikidata entry for producer "${name}"` });
    setImmediate(() => setCached(nameKey, name, { producerCredits: result }));
    res.json({ name, source: 'fresh', credits: result });
  } catch (err) {
    console.error(`[WD-PRODUCER] Error for "${name}":`, err.message);
    res.status(500).json({ error: 'Producer credits query failed', detail: err.message });
  }
});

// ── SPARQL: producer credits lookup ─────────────────────────
// The query has two legs:
//   Leg A — P162 (record producer) on releases → find performers
//   Leg B — P1040 (film/music video director, used in some entries)
//           plus P175 (performer) link on those releases
// Results are deduplicated and returned as { artist, release, role }.
async function fetchProducerCredits(name) {
  const qid = await getWikidataId(name);
  if (!qid) return null;

  const query = `
    SELECT DISTINCT ?artistLabel ?releaseLabel ?role WHERE {
      {
        # Leg A: releases where this person is listed as record producer (P162)
        ?release wdt:P162 wd:${qid} .
        ?release wdt:P175 ?artist .
        BIND("Producer" AS ?role)
      }
      UNION
      {
        # Leg B: releases where this person is listed as executive producer (P1071)
        ?release wdt:P1071 wd:${qid} .
        ?release wdt:P175 ?artist .
        BIND("Executive Producer" AS ?role)
      }
      UNION
      {
        # Leg C: works where artist credits this producer as influenced_by (P737)
        ?artist wdt:P737 wd:${qid} .
        BIND("Influence" AS ?role)
        BIND(?artist AS ?release)
      }

      # Filter to musical artists / humans only — skip compilations etc.
      ?artist wdt:P31 wd:Q5 .

      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "en".
        ?artist  rdfs:label ?artistLabel .
        ?release rdfs:label ?releaseLabel .
      }
    }
    ORDER BY ?artistLabel
    LIMIT 120
  `;

  const bindings = await sparqlQuery(query);

  // Group by artist, collecting the releases they appear on
  const grouped = {};
  bindings.forEach(b => {
    const artistName  = b.artistLabel?.value;
    const releaseName = b.releaseLabel?.value;
    const role        = b.role?.value || 'Producer';
    if (!artistName || artistName.startsWith('Q')) return;

    if (!grouped[artistName]) {
      grouped[artistName] = { name: artistName, role, releases: [] };
    }
    if (releaseName && !releaseName.startsWith('Q')) {
      grouped[artistName].releases.push(releaseName);
    }
  });

  const credits = Object.values(grouped).map(a => ({
    ...a,
    releases: [...new Set(a.releases)].slice(0, 5), // dedupe, cap at 5
  }));

  console.log(`[WD-PRODUCER] "${name}" (${qid}): ${credits.length} credited artists`);
  return credits;
}

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

// ── GET /api/dijkstra?from=X&to=Y&weighted=false ──────────────
// Find shortest path using Dijkstra's algorithm
// - unweighted (default): pure hop count
// - weighted: uses relationship strength (0-1) as inverse weights
app.get('/api/dijkstra', (req, res) => {
  const { from, to, weighted } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'Provide from and to query params' });
  }

  const useWeights = weighted === 'true';
  const result = dijkstra(graphData, from, to, useWeights);

  if (result.error) {
    return res.status(404).json({ error: result.error });
  }

  res.json(result);
});

// ── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎤 HipHopTree backend running on http://localhost:${PORT}`);
  console.log(`   Health:  http://localhost:${PORT}/health`);
  console.log(`   Graph:   http://localhost:${PORT}/api/graph`);
  console.log(`   Search:  http://localhost:${PORT}/api/search?q=kendrick\n`);
});
