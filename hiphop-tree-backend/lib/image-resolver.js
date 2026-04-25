require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');

const UA = 'HipHopTree/1.0 (https://hiphoptree.com) Node.js';

async function fetchWikiImageByTitle(title) {
  try {
    const res = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: { action: 'query', titles: title, prop: 'pageimages', format: 'json', pithumbsize: 300, redirects: 1 },
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      timeout: 8000,
    });
    const pages = res.data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    if (page?.missing !== undefined) return null;
    return page?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

async function fetchP18Image(wikidataId) {
  try {
    const res = await axios.get('https://www.wikidata.org/w/api.php', {
      params: { action: 'wbgetclaims', entity: wikidataId, property: 'P18', format: 'json' },
      headers: { 'User-Agent': UA },
      timeout: 8000,
    });
    const claims = res.data?.claims?.P18;
    if (!claims?.length) return null;
    const filename = claims[0]?.mainsnak?.datavalue?.value;
    if (!filename) return null;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename.replace(/ /g, '_'))}?width=300`;
  } catch {
    return null;
  }
}

function nameVariants(name) {
  const variants = [name];
  const stripped = name.replace(/\$/g, 's').replace(/[^\w\s'.-]/g, '').trim();
  if (stripped !== name) variants.push(stripped);
  variants.push(`${name} (rapper)`);
  variants.push(`${name} (hip hop musician)`);
  return [...new Set(variants)];
}

async function fetchGoogleImage(name) {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx     = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!apiKey || !cx) return null;
  try {
    const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: { key: apiKey, cx, q: `${name} rapper`, searchType: 'image', num: 1, safe: 'active', imgType: 'face', imgSize: 'medium' },
      timeout: 8000,
    });
    return res.data?.items?.[0]?.link || null;
  } catch {
    return null;
  }
}

async function fetchWikiImage(name, wikidataId = null) {
  // Strategy 1 & 2: Wikipedia with name variants
  for (const variant of nameVariants(name)) {
    const img = await fetchWikiImageByTitle(variant);
    if (img) {
      console.log(`[IMG] ✅ "${name}" via Wikipedia ("${variant}")`);
      return img;
    }
  }

  // Strategy 3: Wikidata P18 via known QID
  if (wikidataId) {
    const img = await fetchP18Image(wikidataId);
    if (img) {
      console.log(`[IMG] ✅ "${name}" via Wikidata P18 (${wikidataId})`);
      return img;
    }
  }

  // Strategy 4: Wikidata entity search → P18
  try {
    const searchRes = await axios.get('https://www.wikidata.org/w/api.php', {
      params: { action: 'wbsearchentities', search: name, language: 'en', format: 'json', limit: 3, type: 'item' },
      headers: { 'User-Agent': UA },
      timeout: 8000,
    });
    for (const result of (searchRes.data?.search || []).slice(0, 2)) {
      const img = await fetchP18Image(result.id);
      if (img) {
        console.log(`[IMG] ✅ "${name}" via Wikidata search → P18 (${result.id})`);
        return img;
      }
    }
  } catch { /* silent */ }

  // Strategy 5: Google Custom Search
  const googleImg = await fetchGoogleImage(name);
  if (googleImg) {
    console.log(`[IMG] ✅ "${name}" via Google Custom Search`);
    return googleImg;
  }

  console.log(`[IMG] ❌ No image found for "${name}"`);
  return null;
}

module.exports = { fetchWikiImage, fetchGoogleImage };
