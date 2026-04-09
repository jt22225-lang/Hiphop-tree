import React, { useEffect, useState } from 'react';
import axios from 'axios';
import WikidataPanel from './WikidataPanel';
import { useArtistImage, getAvatarColors } from './useArtistImage';

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
  'rza',
  'asap-yams',
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
function VerifiedArchitectBadge() {
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

// ── Deep Cut Badge ───────────────────────────────────────────
// The Vinyl purple badge — for artists obscure to mainstream
// audiences but inextricably linked to legendary work.
// Like finding a first-press 7" that influenced an entire genre.
function DeepCutBadge() {
  return (
    <div className="deep-cut-banner">
      <span className="dc-icon">💿</span>
      <div className="dc-text">
        <span className="dc-title">Deep Cut</span>
        <span className="dc-subtitle">Obscure Node · High-Impact Connection</span>
      </div>
      <span className="dc-tooltip" title="This artist has a low public profile but is directly linked to a Verified Architect or a landmark album. The algorithm found the hidden gem.">
        ⓘ
      </span>
    </div>
  );
}

// ── Role Evolution Section ────────────────────────────────────
// Derives "Protégé" vs "Mentor" from the direction of mentorship
// edges and the year they were formed. This is how we tell the
// story of an artist growing from student to teacher over time.
//
// Think of it like a river delta — each branch is a protégé
// relationship that splits off as the mentor becomes more central.
function RoleEvolutionCard({ artist, connections, graphData, activeYear }) {
  const mentorConnections = connections.filter(r => r.type === 'mentorship');
  if (mentorConnections.length === 0) return null;

  const asProtege = mentorConnections.filter(r => r.target === artist.id);
  const asMentor  = mentorConnections.filter(r => r.source === artist.id);

  // Year-filtered views
  const activeProtege = asProtege.filter(r => !activeYear || !r.year || r.year <= activeYear);
  const activeMentor  = asMentor.filter(r  => !activeYear || !r.year || r.year <= activeYear);

  if (activeProtege.length === 0 && activeMentor.length === 0) return null;

  // Derive "first mentor link" year to label the journey
  const protegeYears = asProtege.filter(r => r.year).map(r => r.year);
  const mentorYears  = asMentor.filter(r => r.year).map(r => r.year);
  const firstAsProtege = protegeYears.length ? Math.min(...protegeYears) : null;
  const firstAsMentor  = mentorYears.length  ? Math.min(...mentorYears)  : null;

  return (
    <div className="role-evolution-card">
      <div className="re-header">
        <span className="re-icon">🧬</span>
        <span className="re-title">Career Arc</span>
      </div>

      {/* Timeline bar — visual metaphor for the journey */}
      <div className="re-timeline">
        {activeProtege.length > 0 && (
          <div className="re-stage re-stage-protege">
            <span className="re-stage-dot" />
            <div className="re-stage-info">
              <span className="re-stage-label">Protégé</span>
              {firstAsProtege && (
                <span className="re-stage-year">since {firstAsProtege}</span>
              )}
              <span className="re-stage-count">
                {activeProtege.length} mentor{activeProtege.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        {activeProtege.length > 0 && activeMentor.length > 0 && (
          <div className="re-arrow">→</div>
        )}

        {activeMentor.length > 0 && (
          <div className="re-stage re-stage-mentor">
            <span className="re-stage-dot" />
            <div className="re-stage-info">
              <span className="re-stage-label">Mentor</span>
              {firstAsMentor && (
                <span className="re-stage-year">since {firstAsMentor}</span>
              )}
              <span className="re-stage-count">
                {activeMentor.length} protégé{activeMentor.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Personal Connection Note ─────────────────────────────────
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

export default function Sidebar({
  artist,
  graphData,
  apiUrl,
  popupPos,
  onClose,
  deepCutIds,    // ← Set<string>
  activeYear,    // ← current slider year
  artistImages,  // ← pre-cached image URLs from App.js prefetch
}) {
  const [bio, setBio]               = useState(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError]     = useState(null);
  const [geniusResults, setGeniusResults] = useState(null);
  const [loadingGenius, setLoadingGenius] = useState(false);
  const [expanded, setExpanded]     = useState(false);

  const isLegend   = artist.isLegend === true || LEGEND_IDS.has(artist.id);
  const isDeepCut  = deepCutIds?.has(artist.id) || false;
  const metadata   = artist.metadata || {};

  // ── Image resolution — the "Media Resilience" chain ─────────
  // Pass the pre-fetched cached URL (may be undefined); the hook
  // will probe it, then fall through Wikimedia → initial avatar.
  const cachedUrl = artistImages?.[artist.id];
  const { imageUrl, status: imgStatus } = useArtistImage(artist, cachedUrl);
  const avatarColors = getAvatarColors(artist, isLegend, isDeepCut);

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

  // Get ALL connections (not filtered by year — year filter is visual only)
  const connections = graphData.relationships.filter(
    r => r.source === artist.id || r.target === artist.id
  );

  // Connections active at the current slider year
  const activeConnections = connections.filter(
    r => !activeYear || !r.year || r.year <= activeYear
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

  // Group connections by type, only showing those active at the slider year
  const grouped = activeConnections.reduce((acc, rel) => {
    if (!acc[rel.type]) acc[rel.type] = [];
    acc[rel.type].push(rel);
    return acc;
  }, {});

  const typeEmoji = { collaborative:'🎵', mentorship:'🤝', collective:'👥', familial:'👨‍👩‍👦' };
  const typeColor = { collaborative:'#f97316', mentorship:'#22d3ee', collective:'#a855f7', familial:'#4ade80' };

  const BIO_PREVIEW_LENGTH = 280;

  // Count future connections (after active year)
  const futureCount = connections.length - activeConnections.length;

  return (
    <aside
      className={`sidebar ${isLegend ? 'sidebar-legend' : ''} ${isDeepCut ? 'sidebar-deep-cut' : ''}`}
      style={getPopupStyle(popupPos)}
    >
      <button className="close-btn" onClick={onClose}>✕</button>

      {/* ── Verified Architect Banner ── */}
      {isLegend && <VerifiedArchitectBadge />}

      {/* ── Deep Cut Badge — only for non-legends ── */}
      {isDeepCut && !isLegend && <DeepCutBadge />}

      {/* ── Artist info ── */}
      <div className="artist-header">
        {/* ── Media Resilience Avatar ──────────────────────────
            Chain: cached image → Wikimedia Commons → initial letter.
            The loading shimmer plays while the chain resolves,
            so the UI never shows a broken icon. */}
        <div
          className={`artist-avatar ${isLegend ? 'artist-avatar-legend' : ''} ${isDeepCut && !isLegend ? 'artist-avatar-deep-cut' : ''} ${imgStatus === 'loading' ? 'artist-avatar-loading' : ''}`}
          style={
            imgStatus === 'fallback'
              ? { backgroundColor: avatarColors.bg, color: avatarColors.text }
              : {}
          }
        >
          {imgStatus === 'loaded' && imageUrl ? (
            <img
              src={imageUrl}
              alt={artist.name}
              className="artist-avatar-photo"
              onError={(e) => {
                // Last-resort: if the resolved image breaks mid-session, fall back inline
                e.target.style.display = 'none';
                e.target.parentElement.setAttribute('data-fallback', 'true');
                e.target.parentElement.style.backgroundColor = avatarColors.bg;
                e.target.parentElement.style.color = avatarColors.text;
                e.target.parentElement.textContent = artist.name.charAt(0).toUpperCase();
              }}
            />
          ) : imgStatus === 'loading' ? (
            <span className="avatar-shimmer" />
          ) : (
            artist.name.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <h2>
            {artist.name}
            {isLegend && (
              <span className="legend-crown-inline" title="Verified Architect — Legend Status">♛</span>
            )}
            {isDeepCut && !isLegend && (
              <span className="deep-cut-badge-inline" title="Deep Cut — Hidden Gem">💿</span>
            )}
          </h2>
          <p className="artist-meta">{artist.era} · {artist.region}</p>
          {artist.label  && <p className="artist-label">🏷️ {artist.label}</p>}
          {artist.role === 'producer' && (
            <p className="artist-role-badge">🎛️ Producer</p>
          )}
        </div>
      </div>

      {/* ── Role Evolution (mentor/protégé arc) ── */}
      <RoleEvolutionCard
        artist={artist}
        connections={connections}
        graphData={graphData}
        activeYear={activeYear}
      />

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

      {/* ── Connections (year-filtered) ── */}
      <div className="connections-title">
        {activeConnections.length} Connection{activeConnections.length !== 1 ? 's' : ''}
        {activeYear && activeYear < 2024 && futureCount > 0 && (
          <span className="connections-future-hint">
            {' '}· {futureCount} more after {activeYear}
          </span>
        )}
      </div>

      {Object.entries(grouped).map(([type, rels]) => (
        <div key={type} className="connection-group">
          <h4 style={{ color: typeColor[type] }}>
            {typeEmoji[type]} {type.charAt(0).toUpperCase() + type.slice(1)}
          </h4>
          {rels.map(rel => {
            const other = getOtherArtist(rel);
            if (!other) return null;
            const otherIsLegend  = other.isLegend === true || LEGEND_IDS.has(other.id);
            const otherIsDeepCut = deepCutIds?.has(other.id) || false;
            // Direction label for mentorship edges
            const mentorDirection = rel.type === 'mentorship'
              ? (rel.source === artist.id ? '→ Protégé' : '← Mentor')
              : null;
            return (
              <div
                key={rel.id}
                className={`connection-item
                  ${otherIsLegend  ? 'connection-item-legend'    : ''}
                  ${otherIsDeepCut ? 'connection-item-deep-cut'  : ''}
                  ${rel.type === 'mentorship' ? 'connection-item-mentor' : ''}
                `}
              >
                <div className="connection-info">
                  <strong>
                    {other.name}
                    {otherIsLegend  && <span className="conn-crown">♛</span>}
                    {otherIsDeepCut && !otherIsLegend && <span className="conn-dc">💿</span>}
                  </strong>
                  <span className="subtype">{rel.subtype?.replace(/_/g, ' ')}</span>
                  {mentorDirection && (
                    <span className="mentor-direction">{mentorDirection}</span>
                  )}
                  <div className="rel-meta-row">
                    {rel.label && <span className="rel-label">{rel.label}</span>}
                    {rel.year  && <span className="rel-year">{rel.year}</span>}
                  </div>
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
