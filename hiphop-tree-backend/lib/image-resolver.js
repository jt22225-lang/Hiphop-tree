require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');

const UA = 'HipHopTree/1.0 (https://hiphoptree.com) Node.js';
const MAX_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 60000;

class UpstreamError extends Error {
  constructor(url, status) {
    super(`upstream ${status} from ${new URL(url).host}`);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Returns the response, or null for a definitive client error (no result).
// Throws UpstreamError when 429, 5xx, or a network failure persists past retries.
async function httpGet(url, config) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await axios.get(url, {
        timeout: 8000,
        ...config,
        headers: { 'User-Agent': UA, ...config.headers },
      });
    } catch (err) {
      const status = err.response?.status;
      const transient = !err.response || status === 429 || status >= 500;
      if (!transient) return null;
      if (attempt >= MAX_RETRIES) throw new UpstreamError(url, status ?? err.code ?? 'network');
      const retryAfter = Number(err.response?.headers?.['retry-after']);
      const waitMs = retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
        : 1000 * 2 ** attempt;
      await sleep(waitMs);
    }
  }
}

async function fetchWikiImageByTitle(title) {
  const res = await httpGet('https://en.wikipedia.org/w/api.php', {
    params: { action: 'query', titles: title, prop: 'pageimages', format: 'json', pithumbsize: 300, redirects: 1 },
    headers: { 'Accept': 'application/json' },
  });
  const pages = res?.data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (page?.missing !== undefined) return null;
  return page?.thumbnail?.source || null;
}

async function fetchP18Image(wikidataId) {
  const res = await httpGet('https://www.wikidata.org/w/api.php', {
    params: { action: 'wbgetclaims', entity: wikidataId, property: 'P18', format: 'json' },
  });
  const claims = res?.data?.claims?.P18;
  if (!claims?.length) return null;
  const filename = claims[0]?.mainsnak?.datavalue?.value;
  if (!filename) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename.replace(/ /g, '_'))}?width=300`;
}

// Resolves only from the artist's stored identity: never guesses by name.
async function fetchWikiImage({ name, wikipediaUrl = null, wikidataId = null }) {
  if (!wikipediaUrl) {
    console.log(`[IMG] – "${name}" has no stored article; no image`);
    return null;
  }
  const title = decodeURIComponent(wikipediaUrl.split('/wiki/')[1] || '');
  if (!title) return null;

  const thumb = await fetchWikiImageByTitle(title);
  if (thumb) {
    console.log(`[IMG] ✅ "${name}" via stored article ("${title}")`);
    return thumb;
  }

  if (wikidataId) {
    const img = await fetchP18Image(wikidataId);
    if (img) {
      console.log(`[IMG] ✅ "${name}" via Wikidata P18 (${wikidataId})`);
      return img;
    }
  }

  console.log(`[IMG] ❌ No image for "${name}"`);
  return null;
}

module.exports = { fetchWikiImage, UpstreamError };
