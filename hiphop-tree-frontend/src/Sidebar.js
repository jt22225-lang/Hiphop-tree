import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function Sidebar({ artist, graphData, apiUrl, onClose }) {
  const [bio, setBio]               = useState(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError]     = useState(null);
  const [geniusResults, setGeniusResults] = useState(null);
  const [loadingGenius, setLoadingGenius] = useState(false);
  const [expanded, setExpanded]     = useState(false);

  // Auto-fetch Genius bio whenever the selected artist changes
  useEffect(() => {
    setBio(null);
    setBioError(null);
    setExpanded(false);
    setGeniusResults(null);
    setBioLoading(true);

    axios.get(`${apiUrl}/genius/artist/${encodeURIComponent(artist.name)}`)
      .then(res => { setBio(res.data); setBioLoading(false); })
      .catch(err => {
        setBioError(err.response?.data?.error || 'Could not load Genius profile');
        setBioLoading(false);
      });
  }, [artist.name, apiUrl]);

  const connections = graphData.relationships.filter(
    r => r.source === artist.id || r.target === artist.id
  );

  const getOtherArtist = (rel) => {
    const otherId = rel.source === artist.id ? rel.target : rel.source;
    return graphData.artists.find(a => a.id === otherId);
  };

  const verifyOnGenius = async (otherArtist) => {
    setLoadingGenius(true);
    setGeniusResults(null);
    try {
      const res = await axios.get(
        `${apiUrl}/verify/genius?artist1=${encodeURIComponent(artist.name)}&artist2=${encodeURIComponent(otherArtist.name)}`
      );
      setGeniusResults(res.data);
    } catch (e) {
      setGeniusResults({ error: e.message });
    }
    setLoadingGenius(false);
  };

  const grouped = connections.reduce((acc, rel) => {
    if (!acc[rel.type]) acc[rel.type] = [];
    acc[rel.type].push(rel);
    return acc;
  }, {});

  const typeEmoji = { collaborative:'🎵', mentorship:'🤝', collective:'👥', familial:'👨‍👩‍👦' };
  const typeColor = { collaborative:'#f97316', mentorship:'#22d3ee', collective:'#a855f7', familial:'#4ade80' };

  const BIO_PREVIEW_LENGTH = 280;

  return (
    <aside className="sidebar">
      <button className="close-btn" onClick={onClose}>✕</button>

      {/* ── Genius header image ── */}
      {bio?.headerImage && (
        <div className="bio-header-img" style={{ backgroundImage: `url(${bio.headerImage})` }} />
      )}

      {/* ── Artist info ── */}
      <div className="artist-header">
        <div className="artist-avatar" style={{
          backgroundImage: bio?.image ? `url(${bio.image})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}>
          {!bio?.image && artist.name.charAt(0)}
        </div>
        <div>
          <h2>
            {artist.name}
            {bio?.verified && <span className="verified-badge" title="Verified on Genius">✓</span>}
          </h2>
          <p className="artist-meta">{artist.era} · {artist.region}</p>
          {artist.label && <p className="artist-label">🏷️ {artist.label}</p>}
          {bio?.followers != null && (
            <p className="artist-followers">
              {bio.followers.toLocaleString()} Genius followers
            </p>
          )}
        </div>
      </div>

      {/* ── About / Bio section ── */}
      <div className="bio-section">
        <div className="bio-title-row">
          <h4>📖 About</h4>
          {bio?.url && (
            <a href={bio.url} target="_blank" rel="noreferrer" className="genius-link">
              View on Genius ↗
            </a>
          )}
        </div>

        {bioLoading && (
          <div className="bio-loading">
            <div className="bio-spinner" />
            <span>Loading from Genius…</span>
          </div>
        )}

        {bioError && !bioLoading && (
          <p className="bio-error">{bioError}</p>
        )}

        {bio?.about && !bioLoading && (() => {
          const text = bio.about.trim();
          const isLong = text.length > BIO_PREVIEW_LENGTH;
          const display = isLong && !expanded
            ? text.slice(0, BIO_PREVIEW_LENGTH) + '…'
            : text;
          return (
            <div className="bio-text">
              <p>{display}</p>
              {isLong && (
                <button className="read-more-btn" onClick={() => setExpanded(e => !e)}>
                  {expanded ? 'Show less ↑' : 'Read more ↓'}
                </button>
              )}
            </div>
          );
        })()}

        {!bio?.about && !bioLoading && !bioError && (
          <p className="bio-empty">No biography available on Genius.</p>
        )}
      </div>

      {/* ── Connections ── */}
      <div className="connections-title">
        {connections.length} Connection{connections.length !== 1 ? 's' : ''}
      </div>

      {Object.entries(grouped).map(([type, rels]) => (
        <div key={type} className="connection-group">
          <h4 style={{ color: typeColor[type] }}>
            {typeEmoji[type]} {type.charAt(0).toUpperCase() + type.slice(1)}
          </h4>
          {rels.map(rel => {
            const other = getOtherArtist(rel);
            if (!other) return null;
            return (
              <div key={rel.id} className="connection-item">
                <div className="connection-info">
                  <strong>{other.name}</strong>
                  <span className="subtype">{rel.subtype?.replace(/_/g, ' ')}</span>
                  {rel.label && <span className="rel-label">{rel.label}</span>}
                </div>
                <button
                  className="verify-btn"
                  onClick={() => verifyOnGenius(other)}
                  title="Search collaborations on Genius"
                >
                  🔍
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {/* ── Genius collab results ── */}
      {(loadingGenius || geniusResults) && (
        <div className="genius-panel">
          <h4>🎤 Genius Results</h4>
          {loadingGenius && <p>Searching Genius…</p>}
          {geniusResults?.error && <p className="err">Could not load results</p>}
          {geniusResults?.results?.length === 0 && <p>No results found.</p>}
          {geniusResults?.results?.map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noreferrer" className="genius-result">
              {r.title}
            </a>
          ))}
        </div>
      )}
    </aside>
  );
}
