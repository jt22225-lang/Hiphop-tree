/**
 * useArtistImage — Media Resilience Hook
 *
 * Think of this like a DJ with a backup record crate. The main
 * turntable (your stored image URL) plays first. If the needle
 * skips (404 / missing), the DJ instantly reaches for the
 * Wikimedia Commons crate. If that's empty too, the crowd still
 * gets music — a styled initial avatar, no dead air.
 *
 * Fallback chain:
 *   1. cachedImageUrl (from App.js prefetch cache)
 *   2. Wikipedia pageimages API (by artist name)
 *   3. Wikimedia Commons image search (by Wikidata ID)
 *   4. CSS initial avatar (always succeeds)
 */

import { useState, useEffect, useRef } from 'react';

// ── Role → Avatar color map ─────────────────────────────────
// Gold for Architects, Purple for Deep Cuts, era-matched for everyone else.
export const ROLE_AVATAR_COLORS = {
  legend:   { bg: '#FFD700', text: '#1a1a1a' },  // Verified Architect gold
  deepcut:  { bg: '#a855f7', text: '#ffffff' },  // Vinyl purple
  '80s':    { bg: '#7c3aed', text: '#ffffff' },  // Classic purple
  '90s':    { bg: '#e11d48', text: '#ffffff' },  // Crimson — boom-bap era
  '2000s':  { bg: '#f97316', text: '#ffffff' },  // Orange — the Neptunes era
  '2010s':  { bg: '#22d3ee', text: '#0f172a' },  // Cyan — SoundCloud era
  default:  { bg: '#374151', text: '#ffffff' },  // Slate fallback
};

/**
 * getAvatarColors — determines the avatar palette for a node.
 * Priority: legend > deep cut > era > default
 */
export function getAvatarColors(artist, isLegend, isDeepCut) {
  if (isLegend)  return ROLE_AVATAR_COLORS.legend;
  if (isDeepCut) return ROLE_AVATAR_COLORS.deepcut;
  return ROLE_AVATAR_COLORS[artist?.era] || ROLE_AVATAR_COLORS.default;
}

// ── Wikimedia image resolution ──────────────────────────────

/**
 * fetchWikipediaImage — queries the Wikipedia pageimages API.
 * Returns a thumbnail URL or null.
 *
 * This is equivalent to asking the record store clerk:
 * "Do you have anything filed under this artist name?"
 */
async function fetchWikipediaImage(artistName) {
  try {
    const encoded = encodeURIComponent(artistName);
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=pageimages&format=json&pithumbsize=300&origin=*`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data  = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page  = Object.values(pages)[0];
    return page?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

/**
 * fetchWikidataImage — queries Wikimedia Commons via Wikidata ID (Pxx).
 * Used as a secondary fallback when the name-based search fails.
 *
 * Like flipping to the Wikidata catalog number when the artist
 * name has too many spellings.
 */
async function fetchWikidataImage(wikidataId) {
  if (!wikidataId) return null;
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${wikidataId}&property=P18&format=json&origin=*`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data  = await res.json();
    const claims = data?.claims?.P18;
    if (!claims || !claims.length) return null;
    const filename = claims[0]?.mainsnak?.datavalue?.value;
    if (!filename) return null;
    // Build the Wikimedia Commons URL from the filename
    const encoded   = encodeURIComponent(filename.replace(/ /g, '_'));
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=300`;
  } catch {
    return null;
  }
}

/**
 * probeImage — resolves when an image URL loads successfully,
 * rejects on 404 / network error. Like cueing up a record
 * before the drop to make sure it'll play.
 */
function probeImage(src) {
  return new Promise((resolve, reject) => {
    const img   = new Image();
    img.onload  = () => resolve(src);
    img.onerror = reject;
    img.src     = src;
  });
}

// ── The hook ────────────────────────────────────────────────

/**
 * useArtistImage(artist, cachedImageUrl)
 *
 * @param {object} artist          — the artist node from graph.json
 * @param {string} cachedImageUrl  — pre-fetched proxied URL from App.js (may be undefined)
 *
 * @returns {{ imageUrl: string|null, status: 'loading'|'loaded'|'fallback' }}
 *
 * status === 'fallback' means no image was found — render the initial avatar.
 * status === 'loaded'   means imageUrl is ready to display.
 * status === 'loading'  means the resolution chain is in progress.
 */
export function useArtistImage(artist, cachedImageUrl) {
  const [state, setState] = useState({
    imageUrl: cachedImageUrl || null,
    status: cachedImageUrl ? 'loading' : 'loading', // probe even cached URLs
  });

  // Keep a ref so the async chain can bail out if the component unmounts
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!artist) {
      setState({ imageUrl: null, status: 'fallback' });
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      // ── Step 1: probe the cached URL (may be from a proxy) ──
      if (cachedImageUrl) {
        try {
          await probeImage(cachedImageUrl);
          if (!cancelled && mountedRef.current) {
            setState({ imageUrl: cachedImageUrl, status: 'loaded' });
            return;
          }
        } catch {
          // cached URL is broken → fall through
        }
      }

      // ── Step 2: probe a direct image property on the artist node ──
      if (artist.image) {
        try {
          await probeImage(artist.image);
          if (!cancelled && mountedRef.current) {
            setState({ imageUrl: artist.image, status: 'loaded' });
            return;
          }
        } catch {
          // artist.image is broken → fall through
        }
      }

      // ── Step 3: query Wikipedia pageimages by name ──
      if (!cancelled) {
        const wikiImg = await fetchWikipediaImage(artist.name);
        if (wikiImg && !cancelled && mountedRef.current) {
          setState({ imageUrl: wikiImg, status: 'loaded' });
          return;
        }
      }

      // ── Step 4: query Wikidata P18 (image) by Wikidata ID ──
      if (!cancelled) {
        const wikidataId = artist.metadata?.wikidataId || artist.wikidataId;
        const wikidataImg = await fetchWikidataImage(wikidataId);
        if (wikidataImg && !cancelled && mountedRef.current) {
          setState({ imageUrl: wikidataImg, status: 'loaded' });
          return;
        }
      }

      // ── Step 5: all sources exhausted — render initial avatar ──
      if (!cancelled && mountedRef.current) {
        setState({ imageUrl: null, status: 'fallback' });
      }
    };

    // Kick off the chain and set loading state
    setState(prev => ({ ...prev, status: 'loading' }));
    resolve();

    return () => { cancelled = true; };
  }, [artist?.id, cachedImageUrl]);

  return state;
}
