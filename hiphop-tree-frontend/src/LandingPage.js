import React, { useEffect, useRef, useState } from 'react';

// ── Animated counter — counts up from 0 to target on mount ──
// Like a scoreboard flipping to the right number. Creates the
// feeling that the data is "alive" and was just computed for you.
function AnimatedStat({ target, label, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const DURATION = 1400; // ms
    const start    = performance.now();

    const tick = (now) => {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / DURATION, 1);
      // Ease-out curve: fast start, slow finish
      const eased    = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    // Small delay so the counter starts after the page animates in
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
      <span className="lp-stat-number">{display.toLocaleString()}{suffix}</span>
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
  onEnter,          // callback — fires when "Enter the Archive" is clicked
  isDissolving,     // bool — triggers the fade+blur exit animation
  artistCount       = 123,
  relationshipCount = 238,
  deepCutCount      = 26,
}) {
  return (
    <div className={`landing-page ${isDissolving ? 'landing-page-dissolving' : ''}`}>

      {/* ── Ambient background orbs ─────────────────────── */}
      <div className="lp-orb lp-orb-gold"  aria-hidden="true" />
      <div className="lp-orb lp-orb-purple" aria-hidden="true" />
      <div className="lp-orb lp-orb-red"   aria-hidden="true" />

      {/* ── Grid overlay texture ─────────────────────────── */}
      <div className="lp-grid-overlay" aria-hidden="true" />

      <div className="lp-content">

        {/* ── Eyebrow ─────────────────────────────────────── */}
        <p className="lp-eyebrow">
          <span className="lp-eyebrow-dot" />
          Interactive Archive · Live Graph Data
          <span className="lp-eyebrow-dot" />
        </p>

        {/* ── Hero headline ───────────────────────────────── */}
        <h1 className="lp-headline">
          HipHopTree<span className="lp-headline-colon">:</span>
          <br />
          <span className="lp-headline-sub">
            The Visual Lineage
            <br />
            of a Global Culture.
          </span>
        </h1>

        {/* ── Sub-headline ────────────────────────────────── */}
        <p className="lp-subheadline">
          An interactive neural network mapping the mentorships, collaborations,
          and architectural foundations of Hip-Hop.
        </p>

        {/* ── Enter button ────────────────────────────────── */}
        <button
          className="lp-enter-btn"
          onClick={onEnter}
          aria-label="Enter the Archive"
        >
          <span className="lp-enter-btn-text">Enter the Archive</span>
          <span className="lp-enter-btn-arrow">→</span>
        </button>

        {/* ── Stats bar ───────────────────────────────────── */}
        <div className="lp-stats-bar">
          <AnimatedStat target={artistCount}       label="Artists"       />
          <div className="lp-stats-divider" />
          <AnimatedStat target={relationshipCount} label="Relationships" />
          <div className="lp-stats-divider" />
          <AnimatedStat target={deepCutCount}      label="Deep Cuts"     />
        </div>

        {/* ── Feature grid ────────────────────────────────── */}
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
            description="Hand-curated Legend nodes — The Alchemist, DJ Premier, J Dilla — with signed artifacts and physical archive provenance."
          />
          <FeatureCard
            icon="🔍"
            title="Graph Intelligence"
            accentColor="#a855f7"
            description="Jump navigation, center-zoom fly-to, Top Collaborator discovery, and Deep Cut detection — all without leaving the map."
          />
        </div>

        {/* ── Curator's Note ──────────────────────────────── */}
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
