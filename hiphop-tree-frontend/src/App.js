import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import GraphView from './GraphView';
import Sidebar from './Sidebar';
import SearchBar from './SearchBar';
import './App.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export default function App() {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [selected, setSelected]   = useState(null);
  const [filter, setFilter]       = useState('all');
  const cyRef = useRef(null);

  // Fetch graph on mount
  useEffect(() => {
    axios.get(`${API}/graph`)
      .then(res => {
        setGraphData(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError('Cannot reach backend. Make sure it is running on port 5000.');
        setLoading(false);
      });
  }, []);

  const handleNodeSelect = useCallback((artist) => {
    setSelected(artist);
  }, []);

  const handleSearch = useCallback(async (query) => {
    if (!query) return;
    try {
      const res = await axios.get(`${API}/search?q=${encodeURIComponent(query)}`);
      if (res.data.length > 0 && cyRef.current) {
        const firstId = res.data[0].id;
        const node = cyRef.current.$(`#${firstId}`);
        if (node.length) {
          cyRef.current.animate({ fit: { eles: node, padding: 120 }, duration: 600 });
          node.trigger('tap');
        }
      }
    } catch (e) {
      console.error('Search failed', e);
    }
  }, []);

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
      {/* Header */}
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
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {/* Main area */}
      <main className="main">
        <GraphView
          data={graphData}
          filter={filter}
          onNodeSelect={handleNodeSelect}
          cyRef={cyRef}
        />
        {selected && (
          <Sidebar
            artist={selected}
            graphData={graphData}
            apiUrl={API}
            onClose={() => setSelected(null)}
          />
        )}
      </main>

      {/* Legend */}
      <div className="legend">
        <span className="dot collaborative" /> Collaboration
        <span className="dot mentorship" /> Mentorship
        <span className="dot collective" /> Collective
        <span className="dot familial" /> Family
      </div>
    </div>
  );
}
