import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './ShortestPathGame.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

/**
 * ShortestPathGame - Active game play component
 * Responsibilities:
 *   1. Display start/target artists and current hop counter
 *   2. Listen for Cytoscape node/edge taps to build user path
 *   3. Check if target reached
 *   4. Fetch optimal path from /api/dijkstra on completion
 *   5. Call onGameComplete with result
 */
function ShortestPathGame({
  graphData,
  artist1Id,
  artist2Id,
  onGameComplete,
  onExit,
  cyRef,
  activeYear,
}) {
  const [userPath, setUserPath] = useState([]);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const artist1 = graphData?.artists.find(a => a.id === artist1Id);
  const artist2 = graphData?.artists.find(a => a.id === artist2Id);

  // Calculate current state
  const currentArtistId = userPath.length === 0
    ? artist1Id
    : userPath[userPath.length - 1].to;

  const hops = userPath.length;
  const targetReached = currentArtistId === artist2Id && userPath.length > 0;

  // Get available next artists (neighbors of current artist)
  const availableNextArtists = useCallback(() => {
    if (!graphData || !currentArtistId) {
      return [];
    }

    // Get all neighbors of current artist
    const relationships = graphData.relationships.filter(r =>
      r.source === currentArtistId || r.target === currentArtistId
    );

    // Convert to neighbors with metadata
    const neighborsMap = new Map();
    relationships.forEach(r => {
      const neighborId = r.source === currentArtistId ? r.target : r.source;

      // Skip if already visited (except if it's the target)
      if (neighborId !== artist2Id && userPath.some(p => p.to === neighborId)) {
        return;
      }

      // Use first relationship found for this neighbor
      if (!neighborsMap.has(neighborId)) {
        neighborsMap.set(neighborId, {
          artistId: neighborId,
          rel: r,
        });
      }
    });

    const result = Array.from(neighborsMap.values());

    // Sort so target artist (if available) appears first
    return result.sort((a, b) => {
      if (a.artistId === artist2Id) return -1;
      if (b.artistId === artist2Id) return 1;
      return 0;
    });
  }, [graphData, currentArtistId, userPath, artist2Id]);

  // Handle clicking a next artist
  const handleSelectNextArtist = useCallback((nextArtistId, relation) => {
    const newEdge = {
      from: currentArtistId,
      to: nextArtistId,
      rel: relation,
    };

    const newPath = [...userPath, newEdge];
    setUserPath(newPath);

    // If target reached, auto-complete
    if (nextArtistId === artist2Id) {
      setIsComplete(true);
    }
  }, [currentArtistId, artist2Id, userPath]);

  // When game completes, fetch optimal path and call onGameComplete
  useEffect(() => {
    if (!targetReached || isComplete) return;

    let isMounted = true;

    const fetchOptimal = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API}/dijkstra`, {
          params: {
            from: artist1Id,
            to: artist2Id,
            weighted: false,
          },
        });
        const { path: optimalPath, hops: optimalHops } = response.data;

        if (isMounted) {
          onGameComplete({
            userPath,
            optimalPath: {
              path: optimalPath || [],
              hops: optimalHops || 0,
            },
            userHops: hops,
          });
          setIsComplete(true);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching optimal path:', err);
          setError('Failed to fetch optimal path');
          setLoading(false);
        }
      }
    };

    fetchOptimal();

    return () => {
      isMounted = false;
    };
  }, [targetReached, isComplete, artist1Id, artist2Id, userPath, hops, onGameComplete]);

  const nextArtists = availableNextArtists();
  const currentArtist = graphData?.artists.find(a => a.id === currentArtistId);

  return (
    <div className="game-play-panel">
      <div className="game-header">
        <h1>🎮 Find the Connection</h1>
        <button className="close-btn" onClick={onExit}>✕</button>
      </div>

      {/* Artist Pair Display */}
      <div className="game-artists-display">
        <div className={`artist-node start ${currentArtistId === artist1Id ? 'active' : ''}`}>
          <div className="artist-name">{artist1?.name}</div>
        </div>
        <div className="vs-badge">→</div>
        <div className={`artist-node target ${currentArtistId === artist2Id ? 'active' : ''}`}>
          <div className="artist-name">{artist2?.name}</div>
        </div>
      </div>

      {/* Hop Counter */}
      <div className="hop-counter">
        <div className="counter-label">Hops</div>
        <div className="counter-value">{hops}</div>
      </div>

      {/* Current Path Display */}
      {userPath.length > 0 && (
        <div className="current-path">
          <div className="path-title">Your Path:</div>
          <div className="path-nodes">
            <div className="path-node">{artist1?.name}</div>
            {userPath.map((edge, i) => (
              <div key={i}>
                <div className="path-arrow">→</div>
                <div className="path-node">{graphData?.artists.find(a => a.id === edge.to)?.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Artist Options */}
      <div className="next-artists">
        <div className="next-label">Next connections from {currentArtist?.name}:</div>
        <div className="next-artists-grid">
          {nextArtists.length > 0 ? (
            nextArtists.map(({ artistId, rel }) => {
              const nextArtist = graphData?.artists.find(a => a.id === artistId);
              const isTarget = artistId === artist2Id;
              return (
                <button
                  key={artistId}
                  className={`next-artist-btn ${isTarget ? 'target' : ''}`}
                  onClick={() => handleSelectNextArtist(artistId, rel)}
                  title={`${rel.type}${rel.subtype ? ` - ${rel.subtype}` : ''}`}
                >
                  <div className="artist-name">{nextArtist?.name}</div>
                  <div className="rel-type">{rel.type}</div>
                </button>
              );
            })
          ) : (
            <div className="no-neighbors">No available connections</div>
          )}
        </div>
      </div>

      {/* Loading / Error State */}
      {loading && <div className="game-loading">Computing optimal path...</div>}
      {error && <div className="game-error">{error}</div>}

      {/* Undo Button */}
      {userPath.length > 0 && !loading && (
        <button
          className="game-btn game-btn-secondary"
          onClick={() => setUserPath(userPath.slice(0, -1))}
        >
          ← Undo Last
        </button>
      )}
    </div>
  );
}

export default ShortestPathGame;
