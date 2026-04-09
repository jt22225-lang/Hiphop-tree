import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import GraphView from './GraphView';
import Sidebar from './Sidebar';
import SearchBar from './SearchBar';
import HistorySlider from './HistorySlider';
import './App.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

// ── Legend IDs (mirrored here for flagDeepCuts) ──────────────
const LEGEND_IDS = new Set([
  'dj-premier', 'the-alchemist', 'j-dilla', 'madlib',
  'kanye-west', 'pharrell-williams', 'pete-rock', 'sounwave', 'mf-doom',
  'rza', 'asap-yams',
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
  const [popupPos, setPopupPos]         = useState(null);
  const [filter, setFilter]             = useState('all');
  const [artistImages, setArtistImages] = useState({});
  const [activeYear, setActiveYear]     = useState(2024);   // ← History Slider year
  const [showSlider, setShowSlider]     = useState(false);  // ← toggle slider open/closed
  const cyRef = useRef(null);

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

  // ── Image prefetch (top 25 by degree) ─────────────────────
  const prefetchImages = async (data) => {
    const degrees = {};
    data.artists.forEach(a => { degrees[a.id] = 0; });
    data.relationships.forEach(r => {
      degrees[r.source] = (degrees[r.source] || 0) + 1;
      degrees[r.target] = (degrees[r.target] || 0) + 1;
    });
    const sorted = [...data.artists].sort((a, b) => (degrees[b.id] || 0) - (degrees[a.id] || 0));
    const top    = sorted.slice(0, 25);

    for (const artist of top) {
      try {
        const res = await axios.get(`${API}/wiki-image/${encodeURIComponent(artist.name)}`);
        if (res.data.image) {
          const proxied = `${API}/proxy-image?url=${encodeURIComponent(res.data.image)}`;
          setArtistImages(prev => ({ ...prev, [artist.id]: proxied }));
        }
      } catch (e) {
        // No image — silently skip
      }
      await new Promise(r => setTimeout(r, 100));
    }
  };

  const handleNodeSelect = useCallback((artist, pos) => {
    setSelected(artist);
    setPopupPos(pos || null);
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

  if (loading) return (
    <div className="splash">
      <div className="spinner" />
      <p>Loading the tree…</p>
    </div>
  );

  if (error) return (
    <div className="splash error">
      <h2>⚠️ Backend offline</h2>
      <p>{error}</p>
      <code>cd hiphop-tree-backend && npm run dev</code>
    </div>
  );

  return (
    <div className="app">
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
                ? `All (${graphData.relationships.length})`
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
        <GraphView
          data={graphData}
          filter={filter}
          artistImages={artistImages}
          onNodeSelect={handleNodeSelect}
          cyRef={cyRef}
          activeYear={showSlider ? activeYear : null}
          deepCutIds={deepCutIds}
        />

        {selected && (
          <Sidebar
            artist={selected}
            graphData={graphData}
            apiUrl={API}
            popupPos={popupPos}
            onClose={() => { setSelected(null); setPopupPos(null); }}
            deepCutIds={deepCutIds}
            activeYear={showSlider ? activeYear : null}
            artistImages={artistImages}
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
    </div>
  );
}
