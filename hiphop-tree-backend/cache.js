/**
 * cache.js — Supabase stale-while-revalidate cache helpers
 *
 * Cache key: artist name lowercased (e.g. "kendrick lamar")
 * TTL: 7 days — after that, cached data is still returned instantly
 *      but a background refresh is triggered for the next user.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const STALE_DAYS = 7;

/**
 * Read a cached row by artist name key.
 * Returns the row, or null if not found.
 */
async function getCached(nameKey) {
  try {
    const { data, error } = await supabase
      .from('artist_cache')
      .select('*')
      .eq('id', nameKey)
      .maybeSingle();

    if (error) {
      console.warn('[CACHE] Read error:', error.message);
      return null;
    }
    return data || null;
  } catch (e) {
    console.warn('[CACHE] Read exception:', e.message);
    return null;
  }
}

/**
 * Write / update a cached row.
 * @param {string} nameKey  — lowercased artist name used as cache key
 * @param {string} name     — display name (original casing)
 * @param {object} fields   — any of: { image_url, bio, wikidata, wikidata_id }
 */
async function setCached(nameKey, name, fields) {
  try {
    const stale_at = new Date(Date.now() + STALE_DAYS * 86_400 * 1000).toISOString();

    const { error } = await supabase
      .from('artist_cache')
      .upsert(
        { id: nameKey, name, updated_at: new Date().toISOString(), stale_at, ...fields },
        { onConflict: 'id' }
      );

    if (error) console.warn('[CACHE] Write error:', error.message);
    else       console.log(`[CACHE] ✅ Saved "${name}"`);
  } catch (e) {
    console.warn('[CACHE] Write exception:', e.message);
  }
}

/**
 * Returns true if the cached row has passed its TTL and needs refreshing.
 */
function isStale(row) {
  if (!row || !row.stale_at) return true;
  return new Date(row.stale_at) < new Date();
}

module.exports = { getCached, setCached, isStale };
