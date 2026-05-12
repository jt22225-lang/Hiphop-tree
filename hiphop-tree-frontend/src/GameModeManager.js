import React, { useState, useMemo } from 'react';
import ShortestPathGame from './ShortestPathGame';
import GameResults from './GameResults';
import './GameModeManager.css';

/**
 * GameModeManager - Orchestrates the entire game flow
 * Responsibilities:
 *   1. Show intro / artist selection screen
 *   2. Launch ShortestPathGame when 2 artists selected
 *   3. Show GameResults when game completes
 *   4. Manage game state and scoring
 */
function GameModeManager({
  graphData,
  onGameExit,
  onPathUpdate,
  cyRef,
}) {
  // Game lifecycle state
  const [gamePhase, setGamePhase] = useState('setup'); // 'setup' | 'playing' | 'results'
  const [selectedArtists, setSelectedArtists] = useState([]); // [artistId1, artistId2]
  const [userPath, setUserPath] = useState([]); // [{from, to, rel}, ...]
  const [optimalPath, setOptimalPath] = useState(null); // {path, hops}
  const [userHops, setUserHops] = useState(0);
  const [score, setScore] = useState(0);
  const [gameStats, setGameStats] = useState([]); // For leaderboard
  const [searchInput, setSearchInput] = useState('');

  // Compute filtered artist list for autocomplete
  const filteredArtists = useMemo(() => {
    if (!searchInput.trim() || !graphData) return [];
    const query = searchInput.toLowerCase();
    return graphData.artists
      .filter(a =>
        (a.name.toLowerCase().includes(query) ||
         a.id.toLowerCase().includes(query)) &&
        !selectedArtists.includes(a.id)
      )
      .slice(0, 8);
  }, [searchInput, graphData, selectedArtists]);

  const handleSelectArtist = (artist) => {
    const newSelection = [...selectedArtists, artist.id];
    setSelectedArtists(newSelection);
    setSearchInput('');
    console.log('[Game] Artist selected:', artist.name, 'Total selected:', newSelection.length);

    // Auto-start game when 2 artists selected
    if (newSelection.length === 2) {
      console.log('[Game] Auto-starting game with:', newSelection);
      setTimeout(() => {
        setGamePhase('playing');
        setUserPath([]);
        setUserHops(0);
      }, 300); // Small delay for visual feedback
    }
  };

  const handleRemoveArtist = (artistId) => {
    setSelectedArtists(selectedArtists.filter(id => id !== artistId));
  };

  const handleStartGame = () => {
    if (selectedArtists.length === 2) {
      setGamePhase('playing');
      setUserPath([]);
      setUserHops(0);
    }
  };

  const handleGameComplete = (pathData) => {
    // pathData = { userPath, optimalPath, userHops, optimalHops }
    setUserPath(pathData.userPath);
    setOptimalPath(pathData.optimalPath);
    setUserHops(pathData.userHops);

    // Calculate score: 100 - (userHops - optimalHops) * 25, min 0
    const scoreDiff = Math.max(0, pathData.userHops - pathData.optimalPath.hops);
    const calculatedScore = Math.max(0, 100 - scoreDiff * 25);
    setScore(calculatedScore);

    // Save to stats (localStorage handled in GameResults)
    setGameStats([
      ...gameStats,
      {
        artist1: selectedArtists[0],
        artist2: selectedArtists[1],
        userHops: pathData.userHops,
        optimalHops: pathData.optimalPath.hops,
        score: calculatedScore,
        timestamp: new Date().toISOString(),
      },
    ]);

    setGamePhase('results');
  };

  const handleNextChallenge = () => {
    setSelectedArtists([]);
    setUserPath([]);
    setOptimalPath(null);
    setUserHops(0);
    setScore(0);
    setGamePhase('setup');
  };

  const handleExitGame = () => {
    onGameExit();
  };

  const artist1 = selectedArtists[0]
    ? graphData?.artists.find(a => a.id === selectedArtists[0])
    : null;
  const artist2 = selectedArtists[1]
    ? graphData?.artists.find(a => a.id === selectedArtists[1])
    : null;

  return (
    <div className="game-mode-container">
      {gamePhase === 'setup' && (
        <div className="game-setup-panel">
          <div className="game-header">
            <h1>🎮 Shortest Path Challenge</h1>
            <button className="close-btn" onClick={handleExitGame}>✕</button>
          </div>

          <p className="game-instructions">
            Select two hip-hop artists and find the shortest connection between them by clicking through the graph.
          </p>

          {/* Artist Selection */}
          <div className="artist-selection">
            <div className="selection-area">
              {selectedArtists.length === 0 && (
                <input
                  type="text"
                  placeholder="Search artist 1..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="artist-search-input"
                />
              )}

              {selectedArtists.length === 1 && (
                <div className="artist-slot artist-selected">
                  <span>{artist1?.name}</span>
                  <button onClick={() => handleRemoveArtist(selectedArtists[0])}>✕</button>
                </div>
              )}

              {selectedArtists.length === 1 && (
                <input
                  type="text"
                  placeholder="Search artist 2..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="artist-search-input"
                />
              )}

              {selectedArtists.length === 2 && (
                <div className="artist-pair-display">
                  <div className="artist-slot artist-selected">
                    <span>{artist1?.name}</span>
                    <button onClick={() => handleRemoveArtist(selectedArtists[0])}>✕</button>
                  </div>
                  <div className="vs-badge">VS</div>
                  <div className="artist-slot artist-selected">
                    <span>{artist2?.name}</span>
                    <button onClick={() => handleRemoveArtist(selectedArtists[1])}>✕</button>
                  </div>
                </div>
              )}
            </div>

            {/* Autocomplete dropdown */}
            {searchInput && filteredArtists.length > 0 && (
              <div className="autocomplete-dropdown">
                {filteredArtists.map(artist => (
                  <div
                    key={artist.id}
                    className="autocomplete-item"
                    onClick={() => handleSelectArtist(artist)}
                  >
                    {artist.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Start Button */}
          <button
            className="game-btn game-btn-primary"
            onClick={handleStartGame}
            disabled={selectedArtists.length !== 2}
          >
            Start Challenge
          </button>

          {/* Stats (if any games played) */}
          {gameStats.length > 0 && (
            <div className="game-stats-box">
              <h3>Your Stats</h3>
              <p>Games: {gameStats.length}</p>
              <p>
                Avg Score: {
                  Math.round(gameStats.reduce((sum, g) => sum + g.score, 0) / gameStats.length)
                }
              </p>
            </div>
          )}
        </div>
      )}

      {gamePhase === 'playing' && (
        <ShortestPathGame
          graphData={graphData}
          artist1Id={selectedArtists[0]}
          artist2Id={selectedArtists[1]}
          onGameComplete={handleGameComplete}
          onExit={handleExitGame}
          cyRef={cyRef}
        />
      )}

      {gamePhase === 'results' && (
        <GameResults
          artist1Id={selectedArtists[0]}
          artist2Id={selectedArtists[1]}
          userPath={userPath}
          optimalPath={optimalPath}
          userHops={userHops}
          score={score}
          onNextChallenge={handleNextChallenge}
          onExit={handleExitGame}
          graphData={graphData}
        />
      )}
    </div>
  );
}

export default GameModeManager;
