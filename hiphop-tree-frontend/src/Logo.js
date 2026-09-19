import React from 'react';

const Logo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
    <svg width="32" height="32" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="100" y1="180" x2="70" y2="130" stroke="#FF8C00" strokeWidth="4" strokeLinecap="round"/>
      <line x1="100" y1="180" x2="130" y2="130" stroke="#FF8C00" strokeWidth="4" strokeLinecap="round"/>
      <line x1="70" y1="130" x2="45" y2="80" stroke="#FF8C00" strokeWidth="4" strokeLinecap="round"/>
      <line x1="70" y1="130" x2="85" y2="80" stroke="#FF8C00" strokeWidth="4" strokeLinecap="round"/>
      <line x1="130" y1="130" x2="115" y2="80" stroke="#FF8C00" strokeWidth="4" strokeLinecap="round"/>
      <line x1="130" y1="130" x2="155" y2="80" stroke="#FF8C00" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="100" cy="180" r="11" fill="#ffffff"/>
      <circle cx="70" cy="130" r="8" fill="#FF8C00"/>
      <circle cx="130" cy="130" r="8" fill="#FF8C00"/>
      <circle cx="45" cy="80" r="6" fill="#FF8C00"/>
      <circle cx="85" cy="80" r="6" fill="#FF8C00"/>
      <circle cx="115" cy="80" r="6" fill="#FF8C00"/>
      <circle cx="155" cy="80" r="6" fill="#FF8C00"/>
    </svg>
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <span style={{ fontWeight: 'bold', fontSize: '20px', color: '#ffffff' }}>HipHopTree</span>
      <span style={{ position: 'absolute', top: '-4px', right: '-12px', width: '10px', height: '10px', background: '#FF8C00', borderRadius: '3px' }}></span>
    </div>
  </div>
);

export default Logo;
