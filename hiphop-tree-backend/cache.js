/**
 * cache.js — Supabase stale-while-revalidate cache helpers
 *
 * Cache key: artist name lowercased (e.g. "kendrick lamar")
 * TTL: 7 days — after that, cached data is still returned instantly
 *      but a background refresh is triggered for the next user.
 *
 * If SUPABASE_URL / SUPABASE_ANON_KEY are not set the server still
 * starts normally — all cache calls become no-ops and every request
 * falls through to live fetching as before.
 */

const { createClient } = require('@supabase/supabase-js');

const STALE_DAYS = 7;

// Lazy-init: only create the client if both env vars are present and valid
let _supabase = null;
function getClient() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (
    !url || !key ||
    url  === 'your_supabase_project_url_here' ||
    key  === 'your_supabase_anon_key_here'
  ) {
    return null; // cache disabled — server still runs fine
  }

  try {
    _supabase = createClient(url, key);
    console.log('[CACHE] ✅ Supabase connected');
  } catch (e) {
    console.warn('[CACHE] Could not init Supabase:', e.message);
    return null;
  }
  return _supabase;
}

/**
 * Read a cached row by artist name key.
 * Returns the row, or null if not found / cache disabled.
 */
async function getCached(nameKey) {
  const sb = getClient();
  if (!sb) return null;

  try {
    const { data, error } = await sb
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
 * @param {string} nameKey  — lowercased artist name (cache key)
 * @param {string} name     — display name (original casing)
 * @param {object} fields   — any of: { image_url, bio, wikidata, wikidata_id }
 */
async function setCached(nameKey, name, fields) {
  const sb = getClient();
  if (!sb) return;

  try {
    const stale_at = new Date(Date.now() + STALE_DAYS * 86_400 * 1000).toISOString();

    const { error } = await sb
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
