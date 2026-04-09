import React, { useEffect, useState } from 'react';
import axios from 'axios';
import WikidataPanel from './WikidataPanel';

const POPUP_WIDTH = 340;

// The same set as GraphView — determines who gets the crown treatment
const LEGEND_IDS = new Set([
  'dj-premier',
  'the-alchemist',
  'j-dilla',
  'madlib',
  'kanye-west',
  'pharrell-williams',
  'pete-rock',
  'sounwave',
  'mf-doom',
]);

function getPopupStyle(popupPos) {
  if (!popupPos) return {};
  const gap      = 14;
  const halfNode = (popupPos.size || 40) / 2;
  const rawLeft  = popupPos.x - POPUP_WIDTH / 2;
  const left     = Math.max(12, Math.min(rawLeft, window.innerWidth - POPUP_WIDTH - 12));
  const top      = popupPos.y - halfNode - gap;
  return {
    position:  'fixed',
    left:      `${left}px`,
    top:       `${top}px`,
    transform: 'translateY(-100%)',
    width:     `${POPUP_WIDTH}px`,
    maxHeight: '80vh',
    overflowY: 'auto',
    zIndex:    200,
  };
}

// ── Verified Architect Badge ─────────────────────────────────
// Displayed at the top of the Info Hub for legend producers.
// The crown + gold glow communicates reverence immediately.
function VerifiedArchitectBadge({ name }) {
  return (
    <div className="verified-architect-banner">
      <span className="va-crown">♛</span>
      <div className="va-text">
        <span className="va-title">Verified Architect</span>
        <span className="va-subtitle">Founding Producer · Hall of Legend</span>
      </div>
    </div>
  );
}

// ── Personal Connection Note ─────────────────────────────────
// Surfaces the "Met Preemo" style personal notes from metadata.
function PersonalNoteCard({ note }) {
  if (!note) return null;
  return (
    <div className="personal-note-card">
      <div className="pn-header">
        <span className="pn-icon">📍</span>
        <span className="pn-label">Personal Connection</span>
      </div>
      <p className="pn-text">{note}</p>
    </div>
  );
}

// ── Cultural Impact Card ─────────────────────────────────────
function CulturalImpactCard({ impact }) {
  if (!impact) return null;
  return (
    <div className="cultural-impact-card">
      <div className="pn-header">
        <span className="pn-icon">🏛️</span>
        <span className="pn-label">Cultural Impact</span>
      </div>
      <p className="pn-text">{impact}</p>
    </div>
  );
}

export default function Sidebar({ artist, graphData, apiUrl, popupPos, onClose }) {
  const [bio, setBio]               = useState(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError]     = useState(null);
  const [geniusResults, setGeniusResults] = useState(null);
  const [loadingGenius, setLoadingGenius] = useState(false);
  const [expanded, setExpanded]     = useState(false);

  const isLegend   = artist.isLegend === true || LEGEND_IDS.has(artist.id);
  const metadata   = artist.metadata || {};

  // Auto-fetch Wikipedia bio whenever the selected artist changes
  useEffect(() => {
    setBio(null);
    setBioError(null);
    setExpanded(false);
    setGeniusResults(null);
    setBioLoading(true);

    axios.get(`${apiUrl}/wiki-bio/${encodeURIComponent(artist.name)}`)
      .then(res => { setBio(res.data); setBioLoading(false); })
      .catch(err => {
        setBioError(err.response?.data?.error || 'No biography found');
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
    <aside
      className={`sidebar ${isLegend ? 'sidebar-legend' : ''}`}
      style={getPopupStyle(popupPos)}
    >
      <button className="close-btn" onClick={onClose}>✕</button>

      {/* ── Verified Architect Banner ── */}
      {isLegend && <VerifiedArchitectBadge name={artist.name} />}

      {/* ── Artist info ── */}
      <div className="artist-header">
        <div className={`artist-avatar ${isLegend ? 'artist-avatar-legend' : ''}`}>
          {artist.name.charAt(0)}
        </div>
        <div>
          <h2>
            {artist.name}
            {isLegend && (
              <span className="legend-crown-inline" title="Verified Architect — Legend Status">♛</span>
            )}
          </h2>
          <p className="artist-meta">{artist.era} · {artist.region}</p>
          {artist.label  && <p className="artist-label">🏷️ {artist.label}</p>}
          {artist.role === 'producer' && (
            <p className="artist-role-badge">🎛️ Producer</p>
          )}
        </div>
      </div>

      {/* ── Personal Connection Note (meeting-inspired) ── */}
      {isLegend && (
        <>
          <PersonalNoteCard note={metadata.personalNote} />
          <CulturalImpactCard impact={metadata.culturalImpact} />
        </>
      )}

      {/* ── About / Bio section ── */}
      <div className="bio-section">
        <div className="bio-title-row">
          <h4>📖 About</h4>
          {bio?.wikiUrl && (
            <a href={bio.wikiUrl} target="_blank" rel="noreferrer" className="genius-link">
              Wikipedia ↗
            </a>
          )}
        </div>

        {bioLoading && (
          <div className="bio-loading">
            <div className="bio-spinner" />
            <span>Loading…</span>
          </div>
        )}

        {bioError && !bioLoading && (
          <p className="bio-error">{bioError}</p>
        )}

        {bio?.about && !bioLoading && (() => {
          const text   = bio.about.trim();
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
          <p className="bio-empty">No biography found.</p>
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
            const otherIsLegend = other.isLegend === true || LEGEND_IDS.has(other.id);
            return (
              <div key={rel.id} className={`connection-item ${otherIsLegend ? 'connection-item-legend' : ''}`}>
                <div className="connection-info">
                  <strong>
                    {other.name}
                    {otherIsLegend && <span className="conn-crown">♛</span>}
                  </strong>
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

      {/* ── Wikidata discoveries ── */}
      <WikidataPanel artist={artist} graphData={graphData} apiUrl={apiUrl} />

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
