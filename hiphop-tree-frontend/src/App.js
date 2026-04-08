import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import GraphView from './GraphView';
import Sidebar from './Sidebar';
import SearchBar from './SearchBar';
import './App.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

export default function App() {
  const [graphData, setGraphData]       = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [selected, setSelected]         = useState(null);
  const [popupPos, setPopupPos]         = useState(null);
  const [filter, setFilter]             = useState('all');
  const [artistImages, setArtistImages] = useState({});
  const cyRef = useRef(null);

  // Fetch graph on mount
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

  // Calculate degree centrality, fetch images for top 25 most connected artists
  const prefetchImages = async (data) => {
    const degrees = {};
    data.artists.forEach(a => { degrees[a.id] = 0; });
    data.relationships.forEach(r => {
      degrees[r.source] = (degrees[r.source] || 0) + 1;
      degrees[r.target] = (degrees[r.target] || 0) + 1;
    });

    const sorted = [...data.artists].sort(
      (a, b) => (degrees[b.id] || 0) - (degrees[a.id] || 0)
    );

    const top = sorted.slice(0, 25);
    const images = {};

    for (const artist of top) {
      try {
        const res = await axios.get(
          `${API}/wiki-image/${encodeURIComponent(artist.name)}`
        );
        if (res.data.image) {
          const proxied = `${API}/proxy-image?url=${encodeURIComponent(res.data.image)}`;
          console.log(`[IMG] ✅ ${artist.name}`);
          setArtistImages(prev => ({ ...prev, [artist.id]: proxied }));
        }
      } catch (e) {
        console.log(`[IMG] ❌ ${artist.name} — no Wikipedia image`);
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

  // Relationship counts for legend
  const counts = graphData ? graphData.relationships.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {}) : {};

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
              {f === 'all' ? `All (${graphData.relationships.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f] || 0})`}
            </button>
          ))}
        </div>
      </header>

      <main className="main">
        <GraphView
          data={graphData}
          filter={filter}
          artistImages={artistImages}
          onNodeSelect={handleNodeSelect}
          cyRef={cyRef}
        />
        {selected && (
          <Sidebar
            artist={selected}
            graphData={graphData}
            apiUrl={API}
            popupPos={popupPos}
            onClose={() => { setSelected(null); setPopupPos(null); }}
          />
        )}
      </main>

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
      </div>
    </div>
  );
}
