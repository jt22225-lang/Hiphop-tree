import React, { useState } from 'react';

export default function SearchBar({ onSearch }) {
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(value);
  };

  return (
    <div className="search-wrap">
      <form className="search-form" onSubmit={handleSubmit}>
        <input
          className="search-input"
          type="text"
          placeholder="Search artist…"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <button type="submit" className="search-btn">🔍</button>
      </form>

      {/* ── Sonic Link discovery tooltip ── */}
      <span className="search-audio-tip" title="Glowing orange lines have 30-second audio previews attached">
        🎵 <span className="search-audio-tip__text">Tip: Glowing orange lines contain audio previews.</span>
      </span>
    </div>
  );
}
