import React, { useState } from 'react';

export default function SearchBar({ onSearch }) {
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(value);
  };

  return (
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
  );
}
