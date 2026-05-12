import React, { useEffect, useState } from 'react';
import './GameResults.css';

/**
 * GameResults - Shows game completion results
 * Responsibilities:
 *   1. Display user's path vs optimal path
 *   2. Show score breakdown
 *   3. Highlight optimal path in graph (CSS overlay)
 *   4. Save stats to localStorage
 *   5. Show "Next Challenge" / "Exit Game" buttons
 */
function GameResults({
  artist1Id,
  artist2Id,
  userPath,
  optimalPath,
  userHops,
  score,
  onNextChallenge,
  onExit,
  graphData,
}) {
  const [stats, setStats] = useState([]);

  const artist1 = graphData?.artists.find(a => a.id === artist1Id);
  const artist2 = graphData?.artists.find(a => a.id === artist2Id);
  const optimalHops = optimalPath?.hops || 0;
  const hopDifference = userHops - optimalHops;
  const efficiency = optimalHops > 0 ? Math.round((optimalHops / userHops) * 100) : 100;

  // Save stats to localStorage
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('gameStats') || '[]');
    const newStats = {
      artist1: artist1?.name,
      artist2: artist2?.name,
      userHops,
      optimalHops,
      efficiency,
      score,
      timestamp: new Date().toISOString(),
    };
    saved.push(newStats);
    localStorage.setItem('gameStats', JSON.stringify(saved));
    setStats(saved);
  }, [artist1, artist2, userHops, optimalHops, efficiency, score]);

  // Get total stats
  const totalGames = stats.length;
  const avgScore = totalGames > 0
    ? Math.round(stats.reduce((sum, s) => sum + s.score, 0) / totalGames)
    : 0;
  const avgEfficiency = totalGames > 0
    ? Math.round(stats.reduce((sum, s) => sum + s.efficiency, 0) / totalGames)
    : 0;

  return (
    <div className="game-results-panel">
      <div className="game-header">
        <h1>🎮 Challenge Complete!</h1>
        <button className="close-btn" onClick={onExit}>✕</button>
      </div>

      {/* Score Box */}
      <div className="score-box">
        <div className="score-large">{score}</div>
        <div className="score-label">Points</div>
      </div>

      {/* Comparison */}
      <div className="results-comparison">
        <div className="result-col">
          <h3>Your Path</h3>
          <div className="hops-display user-hops">{userHops} hops</div>
          <div className="path-preview">
            {[artist1?.name, ...userPath.map(e => graphData?.artists.find(a => a.id === e.to)?.name), artist2?.name]
              .filter(Boolean)
              .slice(0, 4)
              .join(' → ')}
            {userPath.length > 4 && '...'}
          </div>
        </div>

        <div className="vs-divider">VS</div>

        <div className="result-col">
          <h3>Optimal Path</h3>
          <div className="hops-display optimal-hops">{optimalHops} hops</div>
          <div className="path-preview">
            {optimalPath?.path && optimalPath.path.length > 0
              ? [artist1?.name, ...optimalPath.path.map(e => graphData?.artists.find(a => a.id === e.to)?.name), artist2?.name]
                  .filter(Boolean)
                  .slice(0, 4)
                  .join(' → ')
              : `${artist1?.name} → ${artist2?.name}`}
            {optimalPath?.path && optimalPath.path.length > 4 && '...'}
          </div>
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="score-breakdown">
        <div className="breakdown-item">
          <span>Base Score</span>
          <span>100 pts</span>
        </div>
        {hopDifference > 0 && (
          <div className="breakdown-item deduction">
            <span>Extra Hops ({hopDifference})</span>
            <span>-{hopDifference * 25} pts</span>
          </div>
        )}
        {hopDifference === 0 && (
          <div className="breakdown-item perfect">
            <span>Perfect Match!</span>
            <span>+0 pts</span>
          </div>
        )}
        <div className="breakdown-divider"></div>
        <div className="breakdown-item total">
          <span>Total</span>
          <span>{score} pts</span>
        </div>
      </div>

      {/* Efficiency Rating */}
      <div className="efficiency-box">
        <div className="efficiency-label">Path Efficiency</div>
        <div className="efficiency-bar">
          <div className="efficiency-fill" style={{ width: `${efficiency}%` }}>
            <span className="efficiency-text">{efficiency}%</span>
          </div>
        </div>
        <div className="efficiency-desc">
          {efficiency === 100
            ? '🎯 Perfect! You found the optimal path!'
            : efficiency >= 80
            ? '👏 Great job! Very close to optimal.'
            : efficiency >= 60
            ? '👍 Good effort! Room to improve.'
            : '💭 Learn the connections to find shorter paths.'}
        </div>
      </div>

      {/* Overall Stats */}
      <div className="overall-stats">
        <h3>Your Stats</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{totalGames}</div>
            <div className="stat-label">Games</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{avgScore}</div>
            <div className="stat-label">Avg Score</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{avgEfficiency}%</div>
            <div className="stat-label">Avg Efficiency</div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="game-actions">
        <button className="game-btn game-btn-primary" onClick={onNextChallenge}>
          Next Challenge 🎮
        </button>
        <button className="game-btn game-btn-secondary" onClick={onExit}>
          Exit Game
        </button>
      </div>
    </div>
  );
}

export default GameResults;
