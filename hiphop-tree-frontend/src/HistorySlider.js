import React, { useCallback } from 'react';

// Derive the current era label based on the active year and available markers
function getEraLabel(year, eraMarkers) {
  if (!eraMarkers || eraMarkers.length === 0) {
    return { year, label: 'Unknown', emoji: '❓' };
  }
  for (let i = eraMarkers.length - 1; i >= 0; i--) {
    if (year >= eraMarkers[i].year) return eraMarkers[i];
  }
  return eraMarkers[0];
}

export default function HistorySlider({ activeYear, onChange, activeCount, totalCount, eraMarkers, minYear, maxYear }) {
  // Fallback to sensible defaults if markers not provided
  const markers = eraMarkers && eraMarkers.length > 0 ? eraMarkers : [
    { year: 2020, label: 'Now', emoji: '⚡' },
  ];
  const MIN_YEAR = minYear ?? (markers.length > 0 ? markers[0].year : 2020);
  const MAX_YEAR = maxYear ?? (markers.length > 0 ? markers[markers.length - 1].year : 2024);

  const pct         = ((activeYear - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
  const currentEra  = getEraLabel(activeYear, markers);

  const handleKey = useCallback((e) => {
    if (e.key === 'ArrowLeft')  onChange(Math.max(MIN_YEAR, activeYear - 1));
    if (e.key === 'ArrowRight') onChange(Math.min(MAX_YEAR, activeYear + 1));
  }, [activeYear, onChange]);

  return (
    <div className="hs-container" role="region" aria-label="History Slider">
      {/* ── Top row: title + year badge + era label ── */}
      <div className="hs-header">
        <span className="hs-icon">📼</span>
        <span className="hs-title">Evolution of a Legend</span>
        <span className="hs-era-chip">
          {currentEra.emoji} {currentEra.label}
        </span>
        <span className="hs-year-display">{activeYear}</span>
        <span className="hs-count">
          {activeCount} / {totalCount} connections
        </span>
      </div>

      {/* ── Slider track ── */}
      <div className="hs-track-wrapper">
        {/* Progress fill behind the thumb */}
        <div
          className="hs-fill"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />

        <input
          type="range"
          min={MIN_YEAR}
          max={MAX_YEAR}
          value={activeYear}
          onChange={e => onChange(Number(e.target.value))}
          onKeyDown={handleKey}
          className="hs-range"
          aria-label={`Year slider, currently ${activeYear}`}
          aria-valuemin={MIN_YEAR}
          aria-valuemax={MAX_YEAR}
          aria-valuenow={activeYear}
        />

        {/* Era tick marks */}
        <div className="hs-ticks" aria-hidden="true">
          {markers.map(m => {
            const leftPct = ((m.year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
            const isActive = m.year <= activeYear;
            const isCurrent = m.year === currentEra.year;
            return (
              <button
                key={m.year}
                className={`hs-tick ${isActive ? 'hs-tick-active' : ''} ${isCurrent ? 'hs-tick-current' : ''}`}
                style={{ left: `${leftPct}%` }}
                onClick={() => onChange(m.year)}
                title={`${m.year}: ${m.label}`}
                tabIndex={-1}
                aria-hidden="true"
              >
                <span className="hs-tick-dot" />
                <span className="hs-tick-label">{m.year}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Quick-jump era pills ── */}
      <div className="hs-era-pills">
        {markers.map(m => (
          <button
            key={m.year}
            className={`hs-pill ${activeYear === m.year ? 'hs-pill-active' : ''}`}
            onClick={() => onChange(m.year)}
            title={`Jump to ${m.year}`}
          >
            {m.emoji} {m.year}
          </button>
        ))}
      </div>
    </div>
  );
}
