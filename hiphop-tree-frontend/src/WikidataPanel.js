import React, { useEffect, useState } from 'react';
import axios from 'axios';

const PROP_CONFIG = {
  relative:      { label: 'Relatives',       emoji: '👨‍👩‍👦', color: '#4ade80' },
  child:         { label: 'Children',        emoji: '👶',      color: '#4ade80' },
  father:        { label: 'Father',          emoji: '👨',      color: '#4ade80' },
  mother:        { label: 'Mother',          emoji: '👩',      color: '#4ade80' },
  spouse:        { label: 'Spouse',          emoji: '💍',      color: '#f472b6' },
  influenced_by: { label: 'Influenced By',   emoji: '🎓',      color: '#22d3ee' },
  member_of:     { label: 'Member Of',       emoji: '👥',      color: '#a855f7' },
  hometown:      { label: 'Hometown',        emoji: '📍',      color: '#fbbf24' },
  record_label:  { label: 'Record Label',    emoji: '🏷️',      color: '#f97316' },
  genre:         { label: 'Genres',          emoji: '🎵',      color: '#818cf8' },
};

const FAMILY_KEYS    = ['relative','child','father','mother','spouse'];
const MENTORSHIP_KEYS = ['influenced_by'];
const COLLECTIVE_KEYS = ['member_of'];
const INFO_KEYS       = ['hometown','record_label','genre'];

export default function WikidataPanel({ artist, graphData, apiUrl }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [open, setOpen]       = useState(false);
  const [fromCache, setFromCache] = useState(false);

  // Only show Wikidata panel if artist has a stored Wikidata ID
  // Don't guess by name to avoid false positives
  const hasStoredWikidataId = !!artist.metadata?.wikidataId;

  // Cache key includes wikidataId to invalidate when ID changes
  const getCacheKey = () => {
    const wikidataId = artist.metadata?.wikidataId || 'none';
    return `wikidata_${artist.id}_${wikidataId}`;
  };

  // Load from localStorage cache with expiry check
  const getCachedData = () => {
    try {
      // Clean up legacy keys without wikidataId suffix (old format: wikidata_<id>, new format: wikidata_<id>_Q...)
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('wikidata_') && !key.includes('_Q')) {
          // Legacy key without Q-number suffix - remove it
          localStorage.removeItem(key);
        }
      }

      const cached = localStorage.getItem(getCacheKey());
      if (cached) {
        const parsed = JSON.parse(cached);
        // Check expiry (30 days = 2592000000 ms)
        if (parsed.timestamp && Date.now() - parsed.timestamp < 30 * 24 * 60 * 60 * 1000) {
          console.log(`[WIKIDATA] Cache hit for ${artist.name} (${artist.id})`);
          return parsed.data;
        } else {
          localStorage.removeItem(getCacheKey());
          console.log(`[WIKIDATA] Cache expired for ${artist.name} (${artist.id})`);
        }
      }
    } catch (e) {
      console.warn('[WIKIDATA] Cache read failed:', e.message);
    }
    return null;
  };

  // Save to localStorage cache with 30-day expiry
  const setCacheData = (dataToCache) => {
    try {
      const cacheWithExpiry = {
        data: dataToCache,
        timestamp: Date.now()
      };
      localStorage.setItem(getCacheKey(), JSON.stringify(cacheWithExpiry));
      console.log(`[WIKIDATA] Cached data for ${artist.name} (${artist.id}), expires in 30 days`);
    } catch (e) {
      console.warn('[WIKIDATA] Cache write failed:', e.message);
    }
  };

  useEffect(() => {
    setData(null);
    setError(null);
    setOpen(false);
    setFromCache(false);
  }, [artist.name, artist.id]);

  const discover = async () => {
    // If data already loaded, just toggle open state
    if (data) {
      setOpen(o => !o);
      return;
    }

    // Try cache first
    const cachedData = getCachedData();
    if (cachedData) {
      setData(cachedData);
      setFromCache(true);
      setOpen(true);
      return;
    }

    // Cache miss — fetch from API
    setLoading(true);
    setOpen(true);
    setFromCache(false);
    try {
      console.log(`[WIKIDATA] Fetching for ${artist.name} (${artist.id})...`);
      // Pass artist ID to use stored Wikidata ID from graph.json
      const res = await axios.get(
        `${apiUrl}/wikidata/artist/${encodeURIComponent(artist.name)}?artistId=${encodeURIComponent(artist.id)}`
      );

      if (res.data) {
        setData(res.data);
        // Cache the data with no expiration (indefinite storage)
        setCacheData(res.data);
        console.log(`[WIKIDATA] Fresh fetch for ${artist.name} (${artist.id})`);
      }
    } catch (e) {
      const errorMsg = e.response?.data?.error || e.message || 'Wikidata lookup failed';
      console.error(`[WIKIDATA] Error for ${artist.name} (${artist.id}):`, errorMsg);
      setError(errorMsg);
    }
    setLoading(false);
  };

  // Check if a name is already in our graph
  const inGraph = (name) =>
    graphData.artists.some(a => a.name.toLowerCase() === name.toLowerCase());

  const renderGroup = (keys, title) => {
    const items = keys.flatMap(k => (data[k] || []).map(v => ({ ...v, propKey: k })));
    if (!items.length) return null;
    return (
      <div className="wd-group" key={title}>
        <h5 className="wd-group-title">{title}</h5>
        {items.map((item, i) => {
          const cfg     = PROP_CONFIG[item.propKey] || {};
          const already = inGraph(item.name);
          return (
            <div key={i} className={`wd-item ${already ? 'wd-in-graph' : 'wd-new'}`}>
              <span className="wd-emoji">{cfg.emoji}</span>
              <span className="wd-name" style={{ color: already ? '#aaa' : cfg.color }}>
                {item.name}
              </span>
              <span className="wd-prop-label">{cfg.label}</span>
              {already
                ? <span className="wd-badge in-graph">In graph</span>
                : <span className="wd-badge new">New ✨</span>
              }
            </div>
          );
        })}
      </div>
    );
  };

  const renderInfo = () => {
    const items = INFO_KEYS.flatMap(k => (data[k] || []).map(v => ({ ...v, propKey: k })));
    if (!items.length) return null;
    return (
      <div className="wd-group">
        <h5 className="wd-group-title">📊 Profile</h5>
        <div className="wd-info-grid">
          {items.map((item, i) => {
            const cfg = PROP_CONFIG[item.propKey] || {};
            return (
              <div key={i} className="wd-info-item">
                <span className="wd-info-label">{cfg.emoji} {cfg.label}</span>
                <span className="wd-info-value" style={{ color: cfg.color }}>{item.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const newDiscoveries = data
    ? [...FAMILY_KEYS, ...MENTORSHIP_KEYS, ...COLLECTIVE_KEYS]
        .flatMap(k => data[k] || [])
        .filter(v => !inGraph(v.name)).length
    : 0;

  // If no stored Wikidata ID, hide the panel entirely
  if (!hasStoredWikidataId) {
    return null;
  }

  return (
    <div className="wd-panel">
      <button className="wd-discover-btn" onClick={discover}>
        <span>🔮 Wikidata Discoveries</span>
        {data && newDiscoveries > 0 && (
          <span className="wd-new-count">{newDiscoveries} new</span>
        )}
        <span className="wd-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="wd-content">
          {loading && (
            <div className="wd-loading">
              <div className="bio-spinner" />
              <span>Querying Wikidata…</span>
            </div>
          )}

          {error && <p className="wd-error">⚠️ {error}</p>}

          {data && !loading && (
            <>
              {fromCache && (
                <div className="wd-cache-indicator">
                  <span className="wd-cache-label">⚡ Cached</span>
                </div>
              )}

              <a
                href={data.wikidataUrl}
                target="_blank"
                rel="noreferrer"
                className="wd-source-link"
              >
                View {artist.name} on Wikidata ↗
              </a>

              {renderInfo()}
              {renderGroup(FAMILY_KEYS,    '👨‍👩‍👦 Family Connections')}
              {renderGroup(MENTORSHIP_KEYS,'🎓 Influences')}
              {renderGroup(COLLECTIVE_KEYS,'👥 Collectives & Groups')}

              {[...FAMILY_KEYS, ...MENTORSHIP_KEYS, ...COLLECTIVE_KEYS]
                .flatMap(k => data[k] || []).length === 0 && (
                <p className="wd-empty">
                  No relationship data found on Wikidata for {artist.name}.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
