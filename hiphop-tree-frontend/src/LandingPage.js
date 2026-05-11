import React, { useEffect, useRef, useState } from 'react';

// ── SVG Logo Tile ─────────────────────────────────────────────
// 15 iconic hip-hop label / collective names arranged across a
// 720×480 tile. Encoded once as a base64 data URI at module load —
// zero network requests, zero individual DOM nodes, infinitely
// tileable via CSS background-repeat.
//
// System fonts only (no external font fetch):
//   'Arial Black' → Impact → Helvetica Neue → Arial → sans-serif
//
// White text on transparent background. The filter applied to the
// container layer handles the monochrome + ghost opacity treatment,
// so the SVG itself stays clean and reusable.
const _LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480">
  <style>
    text {
      font-family: 'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif;
      font-weight: 900;
      font-size: 14px;
      fill: white;
      letter-spacing: 3px;
    }
  </style>
  <!-- Row 1 -->
  <text x="16"  y="52">WU-TANG</text>
  <text x="280" y="52">AFTERMATH</text>
  <text x="565" y="52">TDE</text>
  <!-- Row 2 -->
  <text x="16"  y="132">DEF JAM</text>
  <text x="280" y="132">GRISELDA</text>
  <text x="565" y="132">OVO</text>
  <!-- Row 3 -->
  <text x="16"  y="212">BAD BOY</text>
  <text x="280" y="212">DREAMVILLE</text>
  <text x="565" y="212">XO</text>
  <!-- Row 4 -->
  <text x="16"  y="292">DEATH ROW</text>
  <text x="280" y="292">RAWKUS</text>
  <text x="565" y="292">NWA</text>
  <!-- Row 5 -->
  <text x="16"  y="372">DIPSET</text>
  <text x="280" y="372">RUFF RYDERS</text>
  <text x="565" y="372">SHADY</text>
</svg>`;

// btoa is available in all modern browsers (this is a React SPA, no SSR)
const LOGO_TILE_URI = `data:image/svg+xml;base64,${btoa(_LOGO_SVG)}`;

// ── Logo Grid Layer ───────────────────────────────────────────
// The "all-over print" wallpaper — positioned absolute, rotated
// -12deg (the classic luxury streetwear diagonal), with a lerp-
// smoothed mouse parallax that gives the canvas a 3-D depth layer.
//
// Architecture decisions:
//  - Single CSS background-image (the SVG tile): no per-logo DOM nodes
//  - Continuous rAF loop with lerp (factor 0.07) for inertial drag
//  - Direct DOM style mutation (no React state) so the loop never
//    triggers a re-render — keeps the main thread clear
//  - will-change: transform enables GPU compositing for the parallax
//  - filter: grayscale + brightness + opacity on the inner div so the
//    outer div's opacity can transition independently during dissolve
function LogoGridLayer({ isDissolving }) {
  const innerRef = useRef(null);

  useEffect(() => {
    // Lerp targets — updated by mousemove, consumed by rAF loop
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId;

    const LERP    = 0.07;  // smoothing — lower = more lag/inertia
    const MAX_X   = 20;    // max horizontal parallax displacement (px)
    const MAX_Y   = 13;    // max vertical parallax displacement (px)
    const EPSILON = 0.05;  // threshold to skip a frame update

    // Continuous animation loop — lerps toward the mouse target.
    // The rAF loop runs even when the mouse is idle so the grid
    // gracefully settles back toward center if the mouse leaves.
    const animate = () => {
      const dx = targetX - currentX;
      const dy = targetY - currentY;

      if (Math.abs(dx) > EPSILON || Math.abs(dy) > EPSILON) {
        currentX += dx * LERP;
        currentY += dy * LERP;
        if (innerRef.current) {
          // Combine the base rotation with the parallax translate in
          // a single transform so the browser only composites once.
          innerRef.current.style.transform =
            `rotate(-12deg) translate(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px)`;
        }
      }

      rafId = requestAnimationFrame(animate);
    };

    // Mouse handler — normalises position to [-1, 1] and scales
    const handleMouseMove = (e) => {
      const nx = (e.clientX / window.innerWidth  - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      targetX  = nx * MAX_X;
      targetY  = ny * MAX_Y;
    };

    rafId = requestAnimationFrame(animate);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div
      className={`lp-logo-layer ${isDissolving ? 'lp-logo-layer-dissolving' : ''}`}
      aria-hidden="true"
    >
      <div
        ref={innerRef}
        className="lp-logo-inner"
        style={{ backgroundImage: `url("${LOGO_TILE_URI}")` }}
      />
    </div>
  );
}

// ── Animated counter ─────────────────────────────────────────
function AnimatedStat({ target, label }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const DURATION = 1400;
    const start    = performance.now();

    const tick = (now) => {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };

    const timeout = setTimeout(() => {
      frameRef.current = requestAnimationFrame(tick);
    }, 400);

    return () => {
      clearTimeout(timeout);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target]);

  return (
    <div className="lp-stat">
      <span className="lp-stat-number">{display.toLocaleString()}</span>
      <span className="lp-stat-label">{label}</span>
    </div>
  );
}

// ── Feature card ─────────────────────────────────────────────
function FeatureCard({ icon, title, description, accentColor }) {
  return (
    <div className="lp-feature-card" style={{ '--feature-accent': accentColor }}>
      <div className="lp-feature-icon">{icon}</div>
      <h3 className="lp-feature-title">{title}</h3>
      <p className="lp-feature-desc">{description}</p>
    </div>
  );
}

// ── Main Landing Page ────────────────────────────────────────
export default function LandingPage({
  onEnter,
  isDissolving,
  artistCount       = 240,
  relationshipCount = 571,
  deepCutCount      = 27,
  relationshipTypes = 4,
}) {
  return (
    <div className={`landing-page ${isDissolving ? 'landing-page-dissolving' : ''}`}>

      {/* ── Logo wallpaper — deepest layer ──────────────────
          Renders first in DOM so it sits behind everything.
          Has its own opacity transition that syncs with the
          overall landing-page dissolve.                      */}
      <LogoGridLayer isDissolving={isDissolving} />

      {/* ── Ambient glow orbs ───────────────────────────── */}
      <div className="lp-orb lp-orb-gold"   aria-hidden="true" />
      <div className="lp-orb lp-orb-purple"  aria-hidden="true" />
      <div className="lp-orb lp-orb-red"    aria-hidden="true" />

      {/* ── Dot-grid texture ────────────────────────────── */}
      <div className="lp-grid-overlay" aria-hidden="true" />

      <div className="lp-content">

        <p className="lp-eyebrow">
          <span className="lp-eyebrow-dot" />
          Interactive Archive · Live Graph Data
          <span className="lp-eyebrow-dot" />
        </p>

        <h1 className="lp-headline">
          HipHopTree<span className="lp-headline-colon">:</span>
          <br />
          <span className="lp-headline-sub">
            The Visual Lineage
            <br />
            of a Global Culture.
          </span>
        </h1>

        <p className="lp-subheadline">
          An interactive knowledge graph visualizing every mentor-to-protégé pathway, collaboration, and family tie that shaped hip-hop culture from 1987 to now. Verified relationships sourced from Genius, Wikipedia, and music archives.
        </p>

        <button
          className="lp-enter-btn"
          onClick={onEnter}
          aria-label="Enter the Archive"
        >
          <span className="lp-enter-btn-text">Enter the Archive</span>
          <span className="lp-enter-btn-arrow">→</span>
        </button>

        <div className="lp-stats-bar">
          <AnimatedStat target={artistCount}       label="Artists"       />
          <AnimatedStat target={relationshipCount} label="Relationships" />
          <AnimatedStat target={deepCutCount}      label="Deep Cuts"     />
          <AnimatedStat target={relationshipTypes} label="Relationship Types" />
        </div>

        <div className="lp-features">
          <FeatureCard
            icon="🎵"
            title="Lineage Engine"
            accentColor="#22d3ee"
            description="Animated marching-ant edges trace every mentor → protégé pathway through time. Watch the tree grow from 1987 to now."
          />
          <FeatureCard
            icon="🖋️"
            title="Verified Vault"
            accentColor="#FFD700"
            description="Every relationship cross-referenced across multiple sources. See what's confirmed vs. suggested."
          />
          <FeatureCard
            icon="🔍"
            title="Graph Intelligence"
            accentColor="#a855f7"
            description="Filter by era (1980s-2020s), relationship type, or search any artist. Discover hidden connections."
          />
        </div>

        <div className="lp-why-section">
          <h2 className="lp-section-title">Why HipHopTree?</h2>
          <div className="lp-why-cards">
            <div className="lp-why-card">
              <h3 className="lp-why-card-title">For Hip-Hop Fans</h3>
              <p className="lp-why-card-desc">Stop reading 10 Wikipedia tabs. Visualize the entire ecosystem in one interactive map. Click Kendrick → see his crew → see their crew. Instant context.</p>
            </div>
            <div className="lp-why-card">
              <h3 className="lp-why-card-title">For Music Historians</h3>
              <p className="lp-why-card-desc">A verified, curated dataset of 571 relationships with sources. The most complete hip-hop lineage map ever built.</p>
            </div>
            <div className="lp-why-card">
              <h3 className="lp-why-card-title">For Researchers & Creators</h3>
              <p className="lp-why-card-desc">Understand how hip-hop was built. See which producers shaped eras. Trace mentorship chains from pioneers to modern artists.</p>
            </div>
          </div>
        </div>

        <div className="lp-data-section">
          <h2 className="lp-section-title">The Data</h2>
          <div className="lp-data-grid">
            <div className="lp-data-sources">
              <h3 className="lp-data-subsection-title">Sourced From</h3>
              <ul className="lp-data-list">
                <li><span className="lp-check">✓</span> Genius API (artist credits, collaborations)</li>
                <li><span className="lp-check">✓</span> Wikipedia (verified biographical data)</li>
                <li><span className="lp-check">✓</span> AllMusic (production credits, discography)</li>
                <li><span className="lp-check">✓</span> Primary interviews & liner notes</li>
                <li><span className="lp-check">✓</span> Spotify artist relationships</li>
              </ul>
            </div>
            <div className="lp-data-types">
              <h3 className="lp-data-subsection-title">Relationship Types</h3>
              <ul className="lp-data-list">
                <li><span className="lp-type-icon">🎤</span> <strong>Collaborative</strong> — Featured on, Produced by, Wrote for</li>
                <li><span className="lp-type-icon">👨‍👩‍👦</span> <strong>Familial</strong> — Blood relatives</li>
                <li><span className="lp-type-icon">🎓</span> <strong>Mentorship</strong> — Signed to, Mentored by, Discovered by</li>
                <li><span className="lp-type-icon">🎭</span> <strong>Collective</strong> — Wu-Tang, Griselda, Odd Future, etc.</li>
              </ul>
            </div>
          </div>
        </div>

        <p className="lp-curators-note">
          <span className="lp-curators-icon">📍</span>
          <em>
            A research-led project dedicated to preserving the history of Hip-Hop
            through data visualization and physical archiving.
          </em>
        </p>

      </div>
    </div>
  );
}
