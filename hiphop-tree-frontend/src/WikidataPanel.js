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

  useEffect(() => {
    setData(null);
    setError(null);
    setOpen(false);
  }, [artist.name]);

  const discover = async () => {
    if (data) { setOpen(o => !o); return; }
    setLoading(true);
    setOpen(true);
    try {
      const res = await axios.get(
        `${apiUrl}/wikidata/artist/${encodeURIComponent(artist.name)}`
      );
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Wikidata lookup failed');
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

          {error && <p className="wd-error">{error}</p>}

          {data && !loading && (
            <>
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
