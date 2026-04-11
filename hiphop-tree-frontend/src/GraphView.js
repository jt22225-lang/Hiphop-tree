import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';

cytoscape.use(cola);

// ── Legend / Verified Architects ────────────────────────────
// These nodes are gravity wells in the simulation — all edges
// connecting to them are shorter, pulling collaborators into orbit.
const LEGEND_IDS = new Set([
  'dj-premier',
  'the-alchemist',
  'j-dilla',
  'madlib',
  'kanye-west',
  'pharrell-williams',
  'pete-rock',
  'sounwave',
  'mf-doom',
  'rza',          // Wu-Tang architect — produced 36 Chambers and the entire golden-era Wu catalog
  'asap-yams',    // A$AP Mob creative director — redefined what a rap collective's A&R can be
  'mannie-fresh', // The Architect of New Orleans — built Cash Money's entire sonic identity from the ground up
]);

const LEGEND_GOLD    = '#FFD700';
const DEEP_CUT_COLOR = '#a855f7';  // Vinyl purple — distinct from gold Legend status
const DEEP_CUT_GLOW  = 'rgba(168, 85, 247, 0.4)';

const TYPE_COLORS = {
  collaborative: '#f97316',
  // Mentorship edges use a brighter cyan to make the flow animation pop
  mentorship:    '#22d3ee',
  collective:    '#a855f7',
  familial:      '#4ade80',
};

const ERA_COLORS = {
  '80s':   '#a855f7',
  '90s':   '#e11d48',
  '2000s': '#f97316',
  '2010s': '#22d3ee',
  default: '#6b7280',
};

const MIN_SIZE     = 30;
const MAX_SIZE     = 80;
const LEGEND_BOOST = 28;

const LEGEND_EDGE_LEN      = 110;  // Legend nodes stay short — gravitational pull into orbit
const MENTORSHIP_EDGE_LEN  = 150;  // Family/lineage links stretch for visual breathing room
const COLLAB_EDGE_LEN      = 100;  // Collaboration edges stay tighter; repulsion handles spacing

export default function GraphView({
  data,
  filter,
  artistImages,
  onNodeSelect,
  cyRef,
  activeYear,          // ← History Slider year
  deepCutIds,          // ← Set<string> of "Deep Cut" artist IDs
  focusedCollective,   // ← collective ID string | null  (Label Focus mode)
  onCollectiveReset,   // ← called when user taps the background to exit focus
}) {
  const containerRef         = useRef(null);
  const cyInstance           = useRef(null);
  const pulseRef             = useRef(null);
  const mentorFlowRef        = useRef(null);   // rAF handle for marching ants
  const dashOffsetRef        = useRef(0);       // persists offset across restarts
  const activeMentorEdgesRef = useRef(null);    // which mentor edges are currently animated

  // ── Colored-initial canvas avatar ────────────────────────
  // Like a 45rpm label with the artist initial stamped on it —
  // rendered in the era/role color so the fallback still carries
  // visual meaning. Used by both the onError handler and as the
  // default for any node that never gets a real photo.
  const makeInitialAvatar = (label, color, size = 120) => {
    const canvas  = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    const ctx     = canvas.getContext('2d');

    // Background circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    // Dark inner ring (subtle depth)
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth   = size * 0.04;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();

    // Initial letter
    const initial  = (label || '?').charAt(0).toUpperCase();
    const fontSize = Math.round(size * 0.45);
    ctx.fillStyle  = 'rgba(255,255,255,0.92)';
    ctx.font       = `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur   = size * 0.08;
    ctx.fillText(initial, size / 2, size / 2);

    return canvas.toDataURL('image/png');
  };

  // ── Image application ────────────────────────────────────
  // Probe each cached URL with a real Image() object.
  // On success → apply as Cytoscape background-image.
  // On failure → generate a role-colored initial avatar via canvas
  //              so no node ever shows a broken state.
  useEffect(() => {
    const cy = cyInstance.current;
    if (!cy) return;
    Object.entries(artistImages).forEach(([id, url]) => {
      if (!url) return;
      const node = cy.$(`#${id}`);
      if (!node.length) return;

      const img = new window.Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        node.style('background-image',   `url(${url})`);
        node.style('background-fit',     'cover');
        node.style('background-clip',    'node');
        node.style('background-opacity', 1);
        node.style('background-color',   '#1a1a1a');
        const isLegend = node.data('isLegend');
        node.style('border-width',   isLegend ? 4 : 3);
        node.style('border-color',   isLegend ? LEGEND_GOLD : node.data('color'));
        node.style('border-opacity', 1);
      };

      img.onerror = () => {
        // Bulletproof fallback: stamp the initial onto a role-colored disc
        const dataUrl = makeInitialAvatar(node.data('label'), node.data('color'));
        node.style('background-image',   `url(${dataUrl})`);
        node.style('background-fit',     'cover');
        node.style('background-clip',    'node');
        node.style('background-opacity', 1);
      };

      img.src = url;
    });
  }, [artistImages]);

  // ── Marching Ants helper ─────────────────────────────────
  // Extracted so both the main rebuild and the collective-focus
  // effect can (re)start the animation on any subset of edges.
  // dashOffsetRef persists offset across calls so there's no jump.
  const startMarchingAnts = (edges) => {
    if (mentorFlowRef.current) { cancelAnimationFrame(mentorFlowRef.current); mentorFlowRef.current = null; }
    if (!edges || !edges.length) return;
    activeMentorEdgesRef.current = edges;
    let lastDashTime = 0;
    const DASH_MS    = 1000 / 18;  // ~18fps — gentle on CPU
    const animateDash = (timestamp) => {
      if (!mentorFlowRef.current) return;
      if (timestamp - lastDashTime >= DASH_MS) {
        dashOffsetRef.current -= 2;
        lastDashTime = timestamp;
        activeMentorEdgesRef.current?.style('line-dash-offset', dashOffsetRef.current);
      }
      mentorFlowRef.current = requestAnimationFrame(animateDash);
    };
    mentorFlowRef.current = requestAnimationFrame(animateDash);
  };

  // ── Year-based edge fading (no graph rebuild required) ───
  // Like a time-lapse of the tree: edges outside the active
  // year window fade to near-invisible, keeping the layout
  // stable while showing who was connected at a given moment.
  useEffect(() => {
    const cy = cyInstance.current;
    if (!cy || activeYear == null) return;

    cy.edges().forEach(edge => {
      const year = edge.data('year');
      if (!year) return;
      if (year <= activeYear) {
        edge.removeClass('year-faded');
        edge.addClass('year-active');
      } else {
        edge.removeClass('year-active');
        edge.addClass('year-faded');
      }
    });
  }, [activeYear]);

  // ── Deep Cut node purple ring (no graph rebuild) ─────────
  // When deepCutIds changes, update node border colors live.
  useEffect(() => {
    const cy = cyInstance.current;
    if (!cy || !deepCutIds) return;

    cy.nodes().forEach(node => {
      const id = node.id();
      if (deepCutIds.has(id)) {
        node.addClass('deep-cut');
      } else {
        node.removeClass('deep-cut');
      }
    });
  }, [deepCutIds]);

  // ── Collective / Label Focus ─────────────────────────────
  // When the user clicks a collective badge in the Sidebar:
  //   • All non-member nodes/edges → 0.07 opacity (dim)
  //   • Member nodes → glow pulse + orange overlay
  //   • Member edges → full opacity (incl. marching ants)
  //   • Camera → animate-fit to frame the collective
  // Reset: tap background or same badge again → clear all classes.
  //
  // Think of it like a label showcase at a record fair:
  // the spotlight hits only the table you clicked; everything
  // else fades to background noise.
  useEffect(() => {
    const cy = cyInstance.current;
    if (!cy || !data) return;

    // ── Reset ───────────────────────────────────────────────
    if (!focusedCollective) {
      cy.elements().removeClass('collective-dim collective-glow');
      // Restore full mentor-edge marching ants
      const allMentorEdges = cy.edges('[?isMentorEdge]');
      startMarchingAnts(allMentorEdges);
      return;
    }

    // ── Find the collective ─────────────────────────────────
    const collective = data.collectives?.find(c => c.id === focusedCollective);
    if (!collective) return;
    const memberIds = new Set(collective.members || []);

    // ── Apply dim / glow to nodes ───────────────────────────
    cy.nodes().forEach(node => {
      if (memberIds.has(node.id())) {
        node.removeClass('collective-dim');
        node.addClass('collective-glow');
      } else {
        node.removeClass('collective-glow');
        node.addClass('collective-dim');
      }
    });

    // ── Apply dim / glow to edges ────────────────────────────
    // An edge is "in the collective" if both endpoints are members,
    // OR if at least one endpoint is — so you see the label's
    // outward connections in context (one hop beyond).
    const collectiveMentorEdges = [];
    cy.edges().forEach(edge => {
      const srcIn = memberIds.has(edge.source().id());
      const tgtIn = memberIds.has(edge.target().id());
      if (srcIn || tgtIn) {
        edge.removeClass('collective-dim');
        edge.addClass('collective-glow');
        if (edge.data('isMentorEdge')) collectiveMentorEdges.push(edge);
      } else {
        edge.removeClass('collective-glow');
        edge.addClass('collective-dim');
      }
    });

    // ── Selective marching ants — only within the collective ─
    // Build a Cytoscape collection from the filtered mentor edges.
    if (collectiveMentorEdges.length > 0) {
      const filteredCollection = cy.collection(collectiveMentorEdges);
      startMarchingAnts(filteredCollection);
    }

    // ── Frame the collective ─────────────────────────────────
    // Zoom out just enough to see all members + a comfortable
    // 80px margin so nothing gets clipped at the screen edge.
    const memberNodes = cy.nodes().filter(n => memberIds.has(n.id()));
    if (memberNodes.length > 0) {
      cy.animate(
        { fit: { eles: memberNodes, padding: 80 } },
        { duration: 750, easing: 'ease-in-out' },
      );
    }
  }, [focusedCollective, data]); // eslint-disable-line

  // ── Full rebuild when data / filter changes ──────────────
  useEffect(() => {
    if (!data || !containerRef.current) return;

    // Stop all running animations before rebuilding
    if (pulseRef.current)      { clearInterval(pulseRef.current);           pulseRef.current      = null; }
    if (mentorFlowRef.current) { cancelAnimationFrame(mentorFlowRef.current); mentorFlowRef.current = null; }

    // ── Degree centrality ──────────────────────────────────
    const degrees = {};
    data.artists.forEach(a => { degrees[a.id] = 0; });
    data.relationships.forEach(r => {
      if (filter !== 'all' && r.type !== filter) return;
      degrees[r.source] = (degrees[r.source] || 0) + 1;
      degrees[r.target] = (degrees[r.target] || 0) + 1;
    });
    const maxDeg = Math.max(...Object.values(degrees), 1);
    const getSize = id => {
      const base = Math.round(MIN_SIZE + ((degrees[id] || 0) / maxDeg) * (MAX_SIZE - MIN_SIZE));
      return LEGEND_IDS.has(id) ? base + LEGEND_BOOST : base;
    };

    // ── Build elements ─────────────────────────────────────
    const elements = [];

    data.artists.forEach(a => {
      const size       = getSize(a.id);
      const isLegend   = a.isLegend === true || LEGEND_IDS.has(a.id);
      const isDeepCut  = deepCutIds?.has(a.id) || false;
      elements.push({
        data: {
          id:         a.id,
          label:      a.name,
          era:        a.era,
          region:     a.region,
          color:      isLegend
                        ? LEGEND_GOLD
                        : isDeepCut
                          ? DEEP_CUT_COLOR
                          : (ERA_COLORS[a.era] || ERA_COLORS.default),
          size,
          isLegend,
          isDeepCut,
          role:       a.role || 'artist',
        }
      });
    });

    data.relationships.forEach(r => {
      if (filter !== 'all' && r.type !== filter) return;
      const isLegendEdge    = LEGEND_IDS.has(r.source) || LEGEND_IDS.has(r.target);
      const isMentorEdge    = r.type === 'mentorship';
      // Year-based visibility on initial render
      const withinYear      = activeYear == null || !r.year || r.year <= activeYear;
      elements.push({
        data: {
          id:           r.id,
          source:       r.source,
          target:       r.target,
          type:         r.type,
          year:         r.year || null,
          label:        r.subtype?.replace(/_/g, ' '),
          color:        TYPE_COLORS[r.type] || '#6b7280',
          width:        Math.max(1.5, r.strength * (isLegendEdge ? 5 : 4)),
          isLegendEdge,
          isMentorEdge,
        },
        classes: withinYear ? 'year-active' : 'year-faded',
      });
    });

    if (cyInstance.current) {
      cyInstance.current.destroy();
      cyInstance.current = null;
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // ── Standard nodes ─────────────────────────────────
        {
          selector: 'node',
          style: {
            'width':              'data(size)',
            'height':             'data(size)',
            'background-color':   'data(color)',
            'background-opacity': 1,
            'label':              'data(label)',
            'color':              '#ffffff',
            'font-size':          11,
            'font-family':        'Segoe UI, system-ui, sans-serif',
            'font-weight':        600,
            'text-valign':        'bottom',
            'text-halign':        'center',
            'text-margin-y':      6,
            'text-outline-color': '#000000',
            'text-outline-width': 2,
            'border-width':       2,
            'border-color':       'data(color)',
            'border-opacity':     0.6,
          }
        },

        // ── Legend / Verified Architect nodes ──────────────
        // Gold border + outer glow shadow. The "crown" effect
        // is achieved by the overlay-opacity pulse animation below.
        {
          selector: 'node[?isLegend]',
          style: {
            'border-width':        4,
            'border-color':        LEGEND_GOLD,
            'border-opacity':      1,
            'font-size':           13,
            'font-weight':         700,
            'text-outline-width':  3,
            'overlay-color':       LEGEND_GOLD,
            'overlay-padding':     4,
            'overlay-opacity':     0,
            'z-index':             10,
          }
        },

        // ── Deep Cut nodes — Vinyl Purple ring ─────────────
        // Visually distinct from the gold Legend crown: this
        // is the "hidden gem" signal — a niche connection to
        // something huge, like finding a first-press 45.
        {
          selector: 'node[?isDeepCut]',
          style: {
            'border-width':        3,
            'border-color':        DEEP_CUT_COLOR,
            'border-opacity':      1,
            'overlay-color':       DEEP_CUT_COLOR,
            'overlay-padding':     3,
            'overlay-opacity':     0,
            'z-index':             5,
          }
        },

        // ── Legend edges — slightly brighter, thicker ──────
        {
          selector: 'edge[?isLegendEdge]',
          style: {
            'opacity':     0.75,
            'line-style':  'solid',
          }
        },

        // ── Mentorship edges — dashed "flowing" line ───────
        // The dashed pattern creates a "marching ants" look.
        // Combined with the animated line-dash-offset, it gives
        // a visual flow from mentor (source) → protégé (target).
        {
          selector: 'edge[?isMentorEdge]',
          style: {
            'line-style':         'dashed',
            'line-dash-pattern':  [10, 5],
            'line-dash-offset':   0,
            'opacity':            0.85,
            'width':              'data(width)',
          }
        },

        // ── Year-faded edges ────────────────────────────────
        // Edges that haven't "happened yet" in the slider year.
        // Like looking at a map before a new highway was built —
        // the ghost of a future connection.
        {
          selector: '.year-faded',
          style: { 'opacity': 0.06 }
        },
        {
          selector: '.year-active',
          style: { 'opacity': 0.55 }
        },
        // Active mentorship edges get higher opacity
        {
          selector: 'edge[?isMentorEdge].year-active',
          style: { 'opacity': 0.85 }
        },

        {
          selector: 'node:selected',
          style: {
            'border-width':   5,
            'border-color':   '#ffffff',
            'border-opacity': 1,
          }
        },
        // ── Click-based focus ───────────────────────────────
        {
          selector: '.faded',
          style: { 'opacity': 0.1, 'transition-property': 'opacity', 'transition-duration': '0.25s' }
        },
        {
          selector: '.highlighted',
          style: { 'opacity': 1, 'transition-property': 'opacity', 'transition-duration': '0.25s' }
        },

        // ── Label Focus — collective dim/glow ──────────────
        // collective-dim: everything outside the selected label
        // collective-glow: nodes that ARE in the label
        // Smooth 0.35s transitions so the mode feels like a
        // spotlight slowly sweeping across a dark stage.
        {
          selector: '.collective-dim',
          style: {
            'opacity':              0.07,
            'transition-property':  'opacity',
            'transition-duration':  '0.35s',
            'transition-timing-function': 'ease-out',
          }
        },
        {
          selector: '.collective-glow',
          style: {
            'opacity':              1,
            'overlay-opacity':      0.18,
            'overlay-color':        '#f97316',
            'overlay-padding':      6,
            'transition-property':  'opacity overlay-opacity',
            'transition-duration':  '0.35s',
            'transition-timing-function': 'ease-out',
          }
        },
        // Nodes that are Legends AND in the collective get the gold overlay
        {
          selector: 'node[?isLegend].collective-glow',
          style: {
            'overlay-color':   LEGEND_GOLD,
            'overlay-opacity': 0.25,
            'overlay-padding': 8,
          }
        },
        // Edges within the collective get full opacity in glow mode
        {
          selector: 'edge.collective-glow',
          style: {
            'opacity':   0.95,
            'width':     'data(width)',
            'overlay-opacity': 0,
          }
        },

        // ── Hover Focus — smooth fade-to-background ─────────
        // hover-faded → everything NOT in the hovered neighborhood
        // hover-highlighted → the hovered node + its 1st-degree connections
        // Transitions make it feel responsive rather than jarring.
        {
          selector: '.hover-faded',
          style: {
            'opacity':              0.08,
            'transition-property':  'opacity',
            'transition-duration':  '0.18s',
            'transition-timing-function': 'ease-out',
          }
        },
        {
          selector: '.hover-highlighted',
          style: {
            'opacity':              1,
            'transition-property':  'opacity',
            'transition-duration':  '0.18s',
            'transition-timing-function': 'ease-out',
          }
        },
        {
          selector: 'edge',
          style: {
            'line-color':              'data(color)',
            'target-arrow-color':      'data(color)',
            'target-arrow-shape':      'triangle',
            'arrow-scale':             0.8,
            'curve-style':             'bezier',
            'width':                   'data(width)',
            'opacity':                 0.55,
            'label':                   'data(label)',
            'font-size':               9,
            'color':                   '#999999',
            'text-background-color':   '#0a0a0a',
            'text-background-opacity': 0.7,
            'text-background-padding': '2px',
            'text-rotation':           'autorotate',
          }
        },
        {
          selector: 'edge:selected',
          style: { 'opacity': 1 }
        },
      ],

      layout: {
        name:              'cola',
        // ── Galaxy Expansion tuning for 350+ nodes ───────────
        // Goal: a spacious "hip-hop galaxy" where crews cluster
        // visibly but never clump into an unreadable mass.
        //
        // The key lever is nodeSpacing (cola's repulsion analogue).
        // Doubling it from 28 → 60 pushes nodes apart aggressively,
        // like cranking the charge in d3-force to -150.
        //
        // Edge lengths are now type-aware: mentorship links get
        // more stretch (150) so lineage flows read as directional
        // rivers across the galaxy, while collaboration edges stay
        // tight (100) and nodeSpacing handles the macro spread.
        //
        // maxSimulationTime raised back to 6000 — the larger spread
        // means the simulation needs more ticks to fully settle.
        animate:              true,
        animationDuration:    1200,
        refresh:              4,
        maxSimulationTime:    6000,  // raised from 4500 — spacious layout needs more settle time
        convergenceThreshold: 0.004,
        fit:                  true,
        padding:              80,    // was 60 — more breathing room at the viewport edges
        nodeSpacing:          60,    // was 28 — doubled repulsion for the "galaxy expansion" spread
        edgeLength: edge => {
          const src = edge.source().id();
          const tgt = edge.target().id();
          // Legend nodes act as gravity wells — keep their edges short
          // so collaborators are pulled into tight orbit around them.
          if (LEGEND_IDS.has(src) || LEGEND_IDS.has(tgt)) return LEGEND_EDGE_LEN;
          // Type-aware stretch for non-legend edges
          return edge.data('type') === 'mentorship' ? MENTORSHIP_EDGE_LEN : COLLAB_EDGE_LEN;
        },
        nodeWeight:           node => LEGEND_IDS.has(node.id()) ? 8 : 1,
        randomize:            false,
        avoidOverlap:         true,
        handleDisconnected:   true,
        centerGraph:          true,
      },

      // ── Zoom range for the "Galaxy" scale ─────────────────
      // minZoom 0.05 lets users pull all the way back to see the
      // full constellation. maxZoom 4 lets them punch in close
      // enough to read the Vault badge detail on a single node.
      minZoom: 0.05,
      maxZoom: 4,

      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    // ── Gold Pulse Animation (Legend nodes) ───────────────
    let pulseExpanding = true;
    const legendNodes  = cy.nodes('[?isLegend]');

    const runPulse = () => {
      const targetOpacity = pulseExpanding ? 0.22 : 0;
      legendNodes.animate(
        { style: { 'overlay-opacity': targetOpacity } },
        { duration: 950, easing: 'ease-in-out', complete: () => { pulseExpanding = !pulseExpanding; } }
      );
    };
    const firstPulseTimeout = setTimeout(runPulse, 1800);
    pulseRef.current = setInterval(runPulse, 1000);

    // ── Deep Cut Purple Pulse Animation ───────────────────
    // Slower, subtler than the legend pulse — like a vinyl
    // record spinning at 33rpm next to a gold-plated turntable.
    let dcPulseExpanding = true;
    const deepCutNodes = cy.nodes('[?isDeepCut]');

    if (deepCutNodes.length > 0) {
      const runDcPulse = () => {
        const targetOpacity = dcPulseExpanding ? 0.18 : 0;
        deepCutNodes.animate(
          { style: { 'overlay-opacity': targetOpacity } },
          { duration: 1400, easing: 'ease-in-out', complete: () => { dcPulseExpanding = !dcPulseExpanding; } }
        );
      };
      setTimeout(runDcPulse, 2400);
      // Use the same pulseRef interval — fires every 1.5s offset from gold pulse
    }

    // ── Mentorship "Marching Dashes" Flow Animation ───────
    // Delegated to startMarchingAnts() so the collective-focus
    // effect can seamlessly switch the target edge set.
    const mentorEdges = cy.edges('[?isMentorEdge]');
    startMarchingAnts(mentorEdges);

    // ── Node interactions ──────────────────────────────────
    cy.on('tap', 'node', evt => {
      const node   = evt.target;
      const artist = data.artists.find(a => a.id === node.id());
      if (artist) {
        const renderedPos = node.renderedPosition();
        const rect        = containerRef.current.getBoundingClientRect();
        onNodeSelect(artist, {
          x:    rect.left + renderedPos.x,
          y:    rect.top  + renderedPos.y,
          size: node.data('size') || 40,
        });
      }
      cy.elements().removeClass('faded highlighted');
      node.closedNeighborhood().addClass('highlighted');
      cy.elements().not(node.closedNeighborhood()).addClass('faded');
    });

    cy.on('tap', evt => {
      if (evt.target === cy) {
        cy.elements().removeClass('faded highlighted');
        onNodeSelect(null);
        // Also exit collective focus if active
        if (onCollectiveReset) onCollectiveReset();
      }
    });

    // ── Hover Focus Mode ──────────────────────────────────────
    // Think of it like a spotlight on stage: when you hover a node,
    // the rest of the graph fades to near-invisible so you can read
    // the 1st-degree neighborhood without the clutter of 160+ nodes.
    //
    // We use a separate class pair (hover-faded / hover-highlighted)
    // so hover and click-selection can coexist independently.
    cy.on('mouseover', 'node', evt => {
      containerRef.current.style.cursor = 'pointer';
      const hoveredNode = evt.target;
      const neighborhood = hoveredNode.closedNeighborhood(); // node + its edges + their other endpoints
      cy.elements().addClass('hover-faded');
      neighborhood.removeClass('hover-faded');
      neighborhood.addClass('hover-highlighted');
    });

    cy.on('mouseout', 'node', () => {
      containerRef.current.style.cursor = 'default';
      cy.elements().removeClass('hover-faded hover-highlighted');
    });

    cyInstance.current = cy;
    cyRef.current      = cy;

    return () => {
      clearTimeout(firstPulseTimeout);
      if (pulseRef.current)      { clearInterval(pulseRef.current);           pulseRef.current      = null; }
      if (mentorFlowRef.current) { cancelAnimationFrame(mentorFlowRef.current); mentorFlowRef.current = null; }
      cy.destroy();
      cyInstance.current = null;
    };
  }, [data, filter]); // eslint-disable-line

  return <div ref={containerRef} className="graph-container" />;
}
