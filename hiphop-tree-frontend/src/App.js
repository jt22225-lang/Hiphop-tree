import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import GraphView from './GraphView';
import Sidebar from './Sidebar';
import SearchBar from './SearchBar';
import HistorySlider from './HistorySlider';
import LandingPage from './LandingPage';
import AudioPreviewPlayer from './AudioPreviewPlayer';
import './App.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

// ── Legend IDs (mirrored here for flagDeepCuts) ──────────────
const LEGEND_IDS = new Set([
  'dj-premier', 'the-alchemist', 'j-dilla', 'madlib',
  'kanye-west', 'pharrell-williams', 'pete-rock', 'sounwave', 'mf-doom',
  'rza', 'asap-yams', 'snoop-dogg',
  'punch',       // TDE President — architect of the entire TDE catalog
]);

// ── Deep Cut Detector ────────────────────────────────────────
// Scans the full connections array and flags artists who are:
//   1. Not a Verified Architect themselves
//   2. In the lower half of degree centrality (less-connected = more obscure)
//   3. Directly linked to at least one Verified Architect
//
// Think of it like a music journalist's "hidden gem" pick:
// the artist nobody talks about who appears on the album everybody
// cites as an influence. The algorithm does the crate-digging.
function flagDeepCuts(graphData) {
  if (!graphData) return new Set();

  // Step 1 — compute degree centrality for all artists
  const degrees = {};
  graphData.artists.forEach(a => { degrees[a.id] = 0; });
  graphData.relationships.forEach(r => {
    degrees[r.source] = (degrees[r.source] || 0) + 1;
    degrees[r.target] = (degrees[r.target] || 0) + 1;
  });

  // Step 2 — find the median degree (the "obscurity threshold")
  const degreeValues   = Object.values(degrees).sort((a, b) => a - b);
  const medianDegree   = degreeValues[Math.floor(degreeValues.length / 2)] ?? 3;

  // Step 3 — find all non-legend artists directly connected to a legend
  const connectedToLegend = new Set();
  graphData.relationships.forEach(r => {
    if (LEGEND_IDS.has(r.source) && !LEGEND_IDS.has(r.target)) {
      connectedToLegend.add(r.target);
    }
    if (LEGEND_IDS.has(r.target) && !LEGEND_IDS.has(r.source)) {
      connectedToLegend.add(r.source);
    }
  });

  // Step 4 — a node is a "Deep Cut" if it's:
  //   - Not a legend itself
  //   - Below-median degree (= lower public profile)
  //   - Connected to at least one legend
  const deepCutIds = new Set();
  graphData.artists.forEach(a => {
    if (
      !LEGEND_IDS.has(a.id) &&
      (degrees[a.id] || 0) <= medianDegree &&
      connectedToLegend.has(a.id)
    ) {
      deepCutIds.add(a.id);
    }
  });

  return deepCutIds;
}

export default function App() {
  const [graphData, setGraphData]       = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [selected, setSelected]         = useState(null);
  const [filter, setFilter]             = useState('all');
  const [artistImages, setArtistImages] = useState({});
  const [activeYear, setActiveYear]       = useState(2024);   // ← History Slider year
  const [showSlider, setShowSlider]       = useState(false);  // ← toggle slider open/closed
  const [focusedCollective, setFocusedCollective] = useState(null); // ← Label Focus
  const [currentAudioMeta, setCurrentAudioMeta]   = useState(null); // ← Sonic Link
  const cyRef = useRef(null);

  // ── Sonic Link handler ───────────────────────────────────────
  // Receives audio_metadata from GraphView when an audio edge is
  // tapped, or null when a non-audio edge / empty canvas is tapped.
  const handleLinkAudio = useCallback((audioMeta) => {
    setCurrentAudioMeta(audioMeta || null);
  }, []);

  // ── Label Focus toggle ───────────────────────────────────────
  // Clicking the same badge twice resets the focus (it's a toggle).
  // Clicking the background of the graph also resets (handled in GraphView).
  const handleCollectiveFocus = useCallback((collectiveId) => {
    setFocusedCollective(prev => prev === collectiveId ? null : collectiveId);
  }, []);

  // ── Landing page state ───────────────────────────────────────
  // isLandingVisible: whether the LandingPage is mounted at all
  // isDissolving: true during the 1.5s CSS exit animation
  const [isLandingVisible, setIsLandingVisible] = useState(true);
  const [isDissolving, setIsDissolving]         = useState(false);
  const [isGraphVisible, setIsGraphVisible]     = useState(false);

  // ── Deep Cut detection (memoized — only recalculates when graphData loads) ──
  const deepCutIds = useMemo(() => flagDeepCuts(graphData), [graphData]);

  // ── Graph fetch ──────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API}/graph`)
      .then(res => {
        setGraphData(res.data);
        setLoading(false);
        prefetchImages(res.data);
      })
      .catch(() => {
        setError('Cannot reach backend. Make sure it is running.');
        setLoading(false);
      });
  }, []);

  // ── Image prefetch — all artists, chunked batch requests ──
  const prefetchImages = async (data) => {
    // Build payload: include wikidataId from metadata when available
    const payload = data.artists.map(a => ({
      id:         a.id,
      name:       a.name,
      wikidataId: a.metadata?.wikidataId || null,
    }));

    // Process in chunks of 20 so we don't hammer the server with one giant request
    const CHUNK = 20;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);
      try {
        const res = await axios.post(`${API}/wiki-image-batch`, { artists: chunk });
        const results = res.data?.results || {};
        // Proxy every returned URL through the backend to avoid CORS issues
        const proxied = {};
        Object.entries(results).forEach(([id, url]) => {
          proxied[id] = `${API}/proxy-image?url=${encodeURIComponent(url)}`;
        });
        setArtistImages(prev => ({ ...prev, ...proxied }));
      } catch (e) {
        console.warn('[prefetchImages] Batch chunk failed:', e.message);
      }
      // Brief pause between chunks so we don't overwhelm external APIs
      if (i + CHUNK < payload.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
  };

  const handleNodeSelect = useCallback((artist) => {
    setSelected(artist);
    document.body.classList.add('sidebar-open');
  }, []);

  // ── Center & Zoom — "Google Maps" nav from sidebar ───────
  // Animates the Cytoscape viewport to center on a specific node,
  // accounting for the 350px sidebar so the node lands in the
  // visible strip (left portion of the graph), not under the panel.
  const handleCenterNode = useCallback((artistId) => {
    const cy = cyRef.current;
    if (!cy) return;
    const node = cy.$(`#${artistId}`);
    if (!node.length) return;

    const ZOOM        = 4;
    const SIDEBAR_W   = 350;
    const pos         = node.position();   // model-space coords
    const viewW       = cy.width();        // full canvas pixel width
    const viewH       = cy.height();

    // Pan math: screenX = modelX * zoom + pan.x
    // We want the node to land at the visual center of the
    // unoccupied strip (everything left of the sidebar).
    const targetPanX = (viewW - SIDEBAR_W) / 2 - pos.x * ZOOM;
    const targetPanY = viewH / 2 - pos.y * ZOOM;

    cy.animate(
      { pan: { x: targetPanX, y: targetPanY }, zoom: ZOOM },
      { duration: 2000, easing: 'ease-in-out' },
    );
  }, [cyRef]);

  // ── "Enter the Archive" dissolve sequence ───────────────────
  // Phase 1 (0ms)    — trigger CSS blur+fade on LandingPage
  //                    + begin graph fade-in simultaneously
  // Phase 2 (1500ms) — unmount LandingPage (DOM gone, perf clean)
  const handleEnterArchive = useCallback(() => {
    setIsDissolving(true);    // start landing page exit animation
    setIsGraphVisible(true);  // start graph fade-in simultaneously

    setTimeout(() => {
      setIsLandingVisible(false); // fully unmount once CSS transition ends
      setIsDissolving(false);
    }, 1500);
  }, []);

  const handleSearch = useCallback(async (query) => {
    if (!query) return;
    try {
      const res = await axios.get(`${API}/search?q=${encodeURIComponent(query)}`);
      if (res.data.length > 0 && cyRef.current) {
        const node = cyRef.current.$(`#${res.data[0].id}`);
        if (node.length) {
          cyRef.current.animate({ fit: { eles: node, padding: 150 }, duration: 600 });
          node.trigger('tap');
        }
      }
    } catch (e) { console.error('Search failed', e); }
  }, []);

  // Relationship counts for legend bar
  const counts = graphData ? graphData.relationships.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {}) : {};

  // Count connections visible at the active year (for slider counter)
  const activeConnectionCount = graphData
    ? graphData.relationships.filter(r => !r.year || r.year <= activeYear).length
    : 0;

  // ── Compute live stats to pass to LandingPage ───────────────
  // Falls back to design-spec numbers while data is still loading.
  const liveArtistCount       = graphData?.artists?.length           ?? 123;
  const liveRelationshipCount = graphData?.relationships?.length     ?? 238;
  const liveDeepCutCount      = deepCutIds?.size                     ?? 26;

  return (
    <>
      {/* ── Landing Page — rendered on top until dissolved ── */}
      {isLandingVisible && (
        <LandingPage
          onEnter={handleEnterArchive}
          isDissolving={isDissolving}
          artistCount={liveArtistCount}
          relationshipCount={liveRelationshipCount}
          deepCutCount={liveDeepCutCount}
        />
      )}

      {/* ── Main App — fades in as landing dissolves ──────── */}
      <div className={`app app-graph-fade ${isGraphVisible ? 'app-graph-visible' : ''}`}>
      <header className="header">
        <div className="logo">🎤 <span>HipHopTree</span></div>
        <SearchBar onSearch={handleSearch} />
        <div className="filters">
          {['all','collaborative','mentorship','collective','familial'].map(f => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all'
                ? `All (${graphData?.relationships?.length ?? '…'})`
                : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f] || 0})`}
            </button>
          ))}
        </div>

        {/* ── History Slider toggle button ── */}
        <button
          className={`slider-toggle-btn ${showSlider ? 'slider-toggle-active' : ''}`}
          onClick={() => setShowSlider(s => !s)}
          title="Toggle Evolution of a Legend timeline"
        >
          📼 {showSlider ? 'Hide' : 'Timeline'}
          {showSlider && <span className="slider-year-chip">{activeYear}</span>}
        </button>

        {/* ── Deep Cut count indicator ── */}
        {deepCutIds.size > 0 && (
          <span className="deep-cut-count-chip" title={`${deepCutIds.size} Deep Cut artists detected`}>
            💿 {deepCutIds.size} Deep Cuts
          </span>
        )}
      </header>

      <main className="main">
        {graphData && (
        <GraphView
          data={graphData}
          filter={filter}
          artistImages={artistImages}
          onNodeSelect={handleNodeSelect}
          cyRef={cyRef}
          activeYear={showSlider ? activeYear : null}
          deepCutIds={deepCutIds}
          focusedCollective={focusedCollective}
          onCollectiveReset={() => setFocusedCollective(null)}
          onLinkAudio={handleLinkAudio}
        />
        )}

        {selected && graphData && (
          <Sidebar
            artist={selected}
            graphData={graphData}
            apiUrl={API}
            onClose={() => { setSelected(null); document.body.classList.remove('sidebar-open'); }}
            deepCutIds={deepCutIds}
            activeYear={showSlider ? activeYear : null}
            artistImages={artistImages}
            onNodeSelect={handleNodeSelect}
            onCenterNode={handleCenterNode}
            focusedCollective={focusedCollective}
            onCollectiveFocus={handleCollectiveFocus}
            onLinkAudio={handleLinkAudio}
          />
        )}
      </main>

      {/* ── History Slider overlay ── */}
      {showSlider && (
        <div className="slider-overlay">
          <HistorySlider
            activeYear={activeYear}
            onChange={setActiveYear}
            activeCount={activeConnectionCount}
            totalCount={graphData?.relationships?.length || 0}
          />
        </div>
      )}

      {/* ── Sonic Link Audio Player ── */}
      <AudioPreviewPlayer
        audioMeta={currentAudioMeta}
        onDismiss={() => setCurrentAudioMeta(null)}
      />

      <div className="legend">
        <span className="legend-title">Relationships:</span>
        <span className="legend-item"><span className="dot collaborative" /><span>Collaboration</span><span className="legend-count">{counts.collaborative || 0}</span></span>
        <span className="legend-item"><span className="dot mentorship" /><span>Mentorship</span><span className="legend-count">{counts.mentorship || 0}</span></span>
        <span className="legend-item"><span className="dot collective" /><span>Collective</span><span className="legend-count">{counts.collective || 0}</span></span>
        <span className="legend-item"><span className="dot familial" /><span>Family</span><span className="legend-count">{counts.familial || 0}</span></span>
        <span className="legend-divider" />
        <span className="legend-title">Era:</span>
        <span className="legend-item"><span className="dot era-80s" /><span>80s</span></span>
        <span className="legend-item"><span className="dot era-90s" /><span>90s</span></span>
        <span className="legend-item"><span className="dot era-2000s" /><span>2000s</span></span>
        <span className="legend-item"><span className="dot era-2010s" /><span>2010s</span></span>
        <span className="legend-divider" />
        <span className="legend-item"><span className="dot legend" /><span>♛ Verified Architect</span></span>
        <span className="legend-item"><span className="dot deep-cut" /><span>💿 Deep Cut</span></span>
      </div>

      {/* ── Loading / error overlays (inside graph view) ── */}
      {loading && (
        <div className="splash splash-overlay">
          <div className="spinner" />
          <p>Loading the tree…</p>
        </div>
      )}
      {error && (
        <div className="splash splash-overlay error">
          <h2>⚠️ Backend offline</h2>
          <p>{error}</p>
          <code>cd hiphop-tree-backend && npm run dev</code>
        </div>
      )}
    </div>
    </>
  );
}
