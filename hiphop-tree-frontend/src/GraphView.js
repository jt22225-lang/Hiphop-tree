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
  'snoop-dogg',   // G-Funk icon — co-defined the West Coast sound on The Chronic and Doggystyle
  'punch',        // TDE President — A&R architect of Kendrick, SZA, Schoolboy Q, Isaiah Rashad, Doechii
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

const MIN_SIZE     = 50;   // Phase 10: proportional base — 50px floor for artists
const LEGEND_BOOST = 20;   // legends = ~70px base + BOOST; hubs fixed at 80px in getSize

// ── Producer Perimeter ───────────────────────────────────────
// All nodes that are Legends OR have role='producer' get locked
// in a fixed decagon on the outer ring so they form an arc of
// gravity wells around the rappers clustered at the centre.
const PRODUCER_PERIMETER_IDS = new Set([
  ...LEGEND_IDS,
  // Additional producers in graph (non-legend but role=producer)
  'havoc', 'q-tip', 'dj-quik', 'dj-muggs', 'daz-dillinger',
  'dj-mustard', 'swizz-beatz', 'hit-boy', 'kal-banx', 'dj-paul',
  'metro-boomin', 'organized-noize', '9th-wonder',
  'daringer', 'beat-butcha',  // Griselda sonic architects
  // punch is already in LEGEND_IDS — listed here for clarity
]);

const LEGEND_EDGE_LEN      = 110;  // kept for reference — legend edges unified at 150px in Phase 13

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
  onLinkAudio,         // ← (audioMeta | null) => void — Sonic Link callback
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

    // ── Collective hub identification ───────────────────────
    // Any artist whose ID matches a collective ID is a hub node
    // (e.g. 'griselda', 'tde', 'roc-a-fella') — rendered at 120px
    // so the label cluster is instantly legible at any zoom level.
    const collectiveIds = new Set((data.collectives || []).map(c => c.id));

    const getSize = id => {
      if (collectiveIds.has(id)) return 80;   // collective hub: 80px fixed plate
      // No MAX_SIZE cap — high-degree nodes breathe freely up to 40px above base
      const base = Math.round(MIN_SIZE + ((degrees[id] || 0) / maxDeg) * 40);
      return LEGEND_IDS.has(id) ? base + LEGEND_BOOST : base;
    };

    // ── Build elements ─────────────────────────────────────
    const elements = [];

    data.artists.forEach(a => {
      const size       = getSize(a.id);
      const isLegend   = a.isLegend === true || LEGEND_IDS.has(a.id);
      const isDeepCut  = deepCutIds?.has(a.id) || false;
      const isProducer = PRODUCER_PERIMETER_IDS.has(a.id);
      const isHub      = collectiveIds.has(a.id);
      const weight     = a.weight ?? 1;
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
          isProducer,
          isHub,
          weight,
          role:       a.role || 'artist',
          // Font size scales with node weight so high-importance labels
          // stay readable even when the graph is zoomed out far.
          fontSize:   isHub ? 14 : isLegend ? 15 : Math.max(9, 9 + Math.round((weight / 10) * 4)),
        }
      });
    });

    data.relationships.forEach(r => {
      if (filter !== 'all' && r.type !== filter) return;
      const isLegendEdge    = LEGEND_IDS.has(r.source) || LEGEND_IDS.has(r.target);
      const isMentorEdge    = r.type === 'mentorship';
      // Year-based visibility on initial render
      const withinYear      = activeYear == null || !r.year || r.year <= activeYear;

      // ── Phase 9: type-based edge widths ──────────────────
      // member_of/mentorship: 10px — structural bonds, heavy rope
      // collaborative: 8px — creative links, still prominent
      // collective/familial: scaled by strength, min 4px
      const edgeWidth = r.subtype === 'member_of'
        ? 10
        : r.type === 'mentorship'
          ? 10
          : r.type === 'collaborative'
            ? 8
            : Math.max(4, r.strength * (isLegendEdge ? 8 : 5));

      // Edge label: use explicit label field if present, otherwise derive from subtype
      const edgeLabel = r.label || r.subtype?.replace(/_/g, ' ');

      elements.push({
        data: {
          id:            r.id,
          source:        r.source,
          target:        r.target,
          type:          r.type,
          subtype:       r.subtype || null,
          year:          r.year || null,
          label:         edgeLabel,
          color:         TYPE_COLORS[r.type] || '#6b7280',
          width:         edgeWidth,
          isLegendEdge,
          isMentorEdge,
          // Sonic Link: forward audio_metadata so tap handler can read it
          audioMeta:     r.audio_metadata || null,
          hasAudio:      !!r.audio_metadata,
        },
        classes: withinYear ? 'year-active' : 'year-faded',
      });
    });

    if (cyInstance.current) {
      cyInstance.current.destroy();
      cyInstance.current = null;
    }

    // ── Pre-compute Producer Perimeter positions ───────────
    // Positions are in Cytoscape MODEL space (not screen pixels).
    // A large fixed radius keeps producers well outside the artist
    // cluster regardless of viewport size. Cola's fit:true will
    // zoom the camera out to show the full ring — so the bigger
    // this number, the more the outer ring dominates the view.
    //
    // ── Phase 17: Void Perimeter — Four-Pole Mapping ─────────
    // Producers cluster at four cardinal poles (±5000 on X, ±3500 on Y)
    // with ±500px random jitter so they don't all stack on one point.
    //
    //   Even index: x = sign·5000,  y = jitter  (East / West arms)
    //   Odd  index: x = jitter,     y = sign·3500 (North / South arms)
    //
    // sign flips every two indices: ++−−++−− so producers spread
    // across both poles of each arm rather than all on one side.

    const perimeterIds  = elements
      .filter(el => el.data?.isProducer && !el.data?.source)
      .map(el => el.data.id);
    const perimeterSet   = new Set(perimeterIds);
    const perimeterCount = perimeterIds.length;

    const perimeterPositions = {};
    perimeterIds.forEach((id, i) => {
      const sign   = (Math.floor(i / 2) % 2 === 0) ? 1 : -1;
      const jitter = () => (Math.random() - 0.5) * 1000;   // ±500px spread
      perimeterPositions[id] = (i % 2 === 0)
        ? { x: sign * 5000, y: jitter() }    // even → East/West pole + vertical spread
        : { x: jitter(),    y: sign * 3500 }; // odd  → North/South pole + horizontal spread
    });

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // ── Standard nodes ─────────────────────────────────
        {
          selector: 'node',
          style: {
            'width':                  'data(size)',
            'height':                 'data(size)',
            'background-color':       'data(color)',
            'background-opacity':     1,
            'label':                  'data(label)',
            'color':                  '#ffffff',
            // Weight-driven font size: high-importance nodes keep bigger labels
            'font-size':              'data(fontSize)',
            'font-family':            'Segoe UI, system-ui, sans-serif',
            'font-weight':            600,
            'text-valign':            'bottom',
            'text-halign':            'center',
            'text-margin-y':          6,
            'text-outline-color':     '#000000',
            'text-outline-width':     3,  // Phase 8: 3px stroke pops labels at galaxy zoom
            'border-width':           2,
            'border-color':           'data(color)',
            'border-opacity':         0.6,
            // Labels for lower-weight nodes disappear when zoomed far out;
            // Legends and producers always remain readable.
            'min-zoomed-font-size':   'data(fontSize)',
          }
        },

        // ── Legend / Verified Architect nodes ──────────────
        // Gold border + outer glow shadow. The "crown" effect
        // is achieved by the overlay-opacity pulse animation below.
        // min-zoomed-font-size: 4 means Legend labels never hide —
        // they're anchor points the eye needs at any zoom level.
        {
          selector: 'node[?isLegend]',
          style: {
            'border-width':          4,
            'border-color':          LEGEND_GOLD,
            'border-opacity':        1,
            'font-size':             15,
            'font-weight':           700,
            'text-outline-width':    3,
            'overlay-color':         LEGEND_GOLD,
            'overlay-padding':       4,
            'overlay-opacity':       0,
            'z-index':               10,
            'min-zoomed-font-size':  4,   // always visible regardless of zoom
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

        // ── Collective Hub nodes — label plate for the cluster ─
        // Larger disc (120px from data.size), bold label, always-visible
        // text so the cluster name anchors the visual neighborhood.
        {
          selector: 'node[?isHub]',
          style: {
            'border-width':         5,           // Phase 9: 5px gold border
            'border-color':         LEGEND_GOLD, // gold frame = label identity
            'border-opacity':       1,
            'border-style':         'solid',
            'font-weight':          700,
            'text-outline-width':   3,
            'min-zoomed-font-size': 4,
            'z-index':              8,
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
            'arrow-scale':             1.2,
            'curve-style':             'bezier',
            'width':                   'data(width)',
            'opacity':                 0.55,
            'label':                   'data(label)',
            'font-size':               24,  // Phase 9: legible at galaxy scale
            'font-weight':             600,
            'color':                   '#e0e0e0',
            'text-background-color':   '#000000',
            'text-background-opacity': 0.8,  // solid black box behind label text
            'text-background-padding': '4px',
            'text-rotation':           'autorotate',
          }
        },
        {
          selector: 'edge:selected',
          style: { 'opacity': 1 }
        },

        // ── Sonic Link edges — audio-enabled ──────────────────
        // These are fiber-optic cables cutting through the spiderweb:
        // thick, glowing, sitting on top of everything else.
        // width:6 triples the line weight vs normal edges.
        // shadow-blur/color creates the neon orange glow halo.
        // z-index:999 floats them above all nodes and edges.
        {
          selector: 'edge[?hasAudio]',
          style: {
            'width':           14,  // Phase 9: stays above 10px mentor baseline
            'line-style':      'solid',
            'shadow-blur':     15,
            'shadow-color':    '#FF8C00',
            'shadow-opacity':  1,
            'shadow-offset-x': 0,
            'shadow-offset-y': 0,
            'z-index':         999,
            'opacity':         1,
          }
        },
      ],

      // Layout is run separately below (after locking producer perimeter nodes)
      layout: { name: 'preset', positions: {} },

      // ── Zoom range for the "Galaxy" scale ─────────────────
      // minZoom 0.05 lets users pull all the way back to see the
      // full constellation. maxZoom 4 lets them punch in close
      // enough to read the Vault badge detail on a single node.
      minZoom: 0.05,
      maxZoom: 4,

      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    // ── Phase 12: Producer Perimeter Prison — initial stamp ──
    // lock()      → Cola physics cannot move these nodes.
    // ungrabify() → User pointer cannot grab or drag them.
    // Both are required: lock() stops the engine; ungrabify() stops the hand.
    if (perimeterCount > 0) {
      cy.nodes().forEach(node => {
        const id = node.id();
        if (perimeterSet.has(id) && perimeterPositions[id]) {
          node.position(perimeterPositions[id]);
          node.lock();
          node.ungrabify();  // environmental anchor — not a draggable node
        }
      });
    }

    // ── Drag-start handler for non-perimeter rapper nodes ────
    // Perimeter nodes are ungrabified so dragstart never fires for them.
    // For rapper nodes: clear any residual fx/fy Cola data so they
    // move freely without snapping to a cached simulation position.
    cy.on('dragstart', 'node', evt => {
      const node = evt.target;
      if (perimeterSet.has(node.id())) return;  // guard: should never reach here anyway
      if (node.locked()) node.unlock();
      node.removeData('fx');
      node.removeData('fy');
    });

    // ── Run Cola physics layout ──────────────────────────────
    const layout = cy.layout({
      name:              'cola',
      animate:              true,
      animationDuration:    1200,
      refresh:              4,
      maxSimulationTime:    7000,
      convergenceThreshold: 0.003,
      fit:                  false,   // we call fit() manually on layoutstop
      padding:              60,
      // Phase 17 physics:
      //   gravity=60 → strong centre pull, rappers form a dense star
      //   nodeSpacing=120 → personal space so nodes stay legible
      nodeSpacing:          120,
      gravity:              60,
      edgeLength: edge => {
        const src = edge.source().id();
        const tgt = edge.target().id();
        // 4500px tether: dramatic long beam from the inner star to the
        // outer void guards. Producer is locked so only rapper is pulled.
        if (PRODUCER_PERIMETER_IDS.has(src) || PRODUCER_PERIMETER_IDS.has(tgt)) return 4500;
        // Cluster cohesion — collective springs stay tight.
        if (edge.data('subtype') === 'member_of') return 55;
        if (edge.data('type') === 'collective') return 70;
        return 200;
      },
      // Phase 17 nodeWeight:
      //   Producers → 50: even locked, high mass signals "stay away"
      //   Hub nodes  → 20: cluster anchors
      //   Rappers    → 1:  drift freely toward the gravity core
      nodeWeight: node => {
        const id = node.id();
        if (PRODUCER_PERIMETER_IDS.has(id)) return 50;
        if (collectiveIds.has(id)) return 20;
        return 1;
      },
      randomize:            false,
      avoidOverlap:         true,
      handleDisconnected:   true,
      centerGraph:          true,
    });

    // ── Collect TDE member IDs for cluster-fit helper ────────
    const tdeMemberIds = new Set(
      (data.collectives?.find(c => c.id === 'tde')?.members) || []
    );

    // ── Phase 12: Prison Hard-Lock — second enforcement pass ─
    // Re-stamp position + re-lock + re-ungrabify after Cola settles.
    // Two-pass guarantee: before layout (engine can't move them) +
    // after layout (camera-fit state confirmed, no animation drift).
    layout.on('layoutstop', () => {
      if (perimeterCount > 0) {
        cy.nodes().forEach(node => {
          const id = node.id();
          if (perimeterSet.has(id) && perimeterPositions[id]) {
            node.position(perimeterPositions[id]);
            node.lock();
            node.ungrabify();
          }
        });
      }

      // Fit the void perimeter (±5000×±3500) with 200px breathing room
      cy.fit(undefined, 200);

      // ── Console helpers ─────────────────────────────────────
      // window.resetLayout() — re-run cola from current positions
      window.resetLayout = () => {
        cy.layout({
          name: 'cola', animate: true, animationDuration: 1200,
          fit: false, nodeSpacing: 120, gravity: 60,
          maxSimulationTime: 5000, avoidOverlap: true,
          edgeLength: e => {
            const s = e.source().id(), t = e.target().id();
            if (PRODUCER_PERIMETER_IDS.has(s) || PRODUCER_PERIMETER_IDS.has(t)) return 4500;
            if (e.data('subtype') === 'member_of') return 55;
            if (e.data('type') === 'collective') return 70;
            return 200;
          },
        }).run();
        setTimeout(() => cy.fit(undefined, 200), 2000);
      };

      window.fitTDE = () => {
        const tdeNodes = cy.nodes().filter(n => tdeMemberIds.has(n.id()));
        if (tdeNodes.length > 0) {
          cy.animate(
            { fit: { eles: tdeNodes, padding: 80 } },
            { duration: 800, easing: 'ease-in-out' }
          );
        }
      };
    });

    layout.run();

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
        // Sonic Link: tapping empty canvas fades out any playing audio
        if (onLinkAudio) onLinkAudio(null);
      }
    });

    // ── Sonic Link — edge tap handler ─────────────────────────
    // Like finding a hidden track on a vinyl record: click a line,
    // and if that relationship has a Spotify preview attached,
    // the mini-player surfaces and starts spinning.
    cy.on('tap', 'edge', evt => {
      const edge      = evt.target;
      const audioMeta = edge.data('audioMeta');

      if (onLinkAudio) {
        // If this edge has audio → hand it to the player.
        // If not → send null so the player fades out (no orphaned audio).
        onLinkAudio(audioMeta || null);
      }

      // Highlight the tapped edge + its endpoint nodes
      cy.elements().removeClass('faded highlighted');
      edge.addClass('highlighted');
      edge.source().addClass('highlighted');
      edge.target().addClass('highlighted');
      cy.elements()
        .not(edge)
        .not(edge.source())
        .not(edge.target())
        .addClass('faded');
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

    // ── Zoom-responsive node scaling ──────────────────────────
    // Phase 10 formula: target model-size = max(50, 80 / zoom)
    //
    // Calibrated for base=50px nodes. Every node inflates proportionally
    // so it renders at a minimum ~80px on-screen. Nodes never get large
    // enough to overlap neighbours — the 80/z ceiling grows gently.
    //
    //   z=1.0 → target=80  → 50px nodes render at ~80px  (1.6×)
    //   z=0.5 → target=160 → 50px nodes render at ~80px  (3.2×)
    //   z=0.2 → target=400 → capped at 8× base (400px model)
    //   z=0.05 → floor: max(50, 1600) capped at 8× base
    let zoomRaf = null;
    cy.on('zoom', () => {
      if (zoomRaf) return;  // throttle to one pass per animation frame
      zoomRaf = requestAnimationFrame(() => {
        zoomRaf = null;
        const z = Math.max(0.05, cy.zoom());
        // targetSize for a 50px base node; all others scale proportionally
        const targetSize = Math.max(50, 80 / z);
        cy.nodes().forEach(node => {
          const base = node.data('size');
          // Cap at 8× to prevent runaway overlap at extreme zoom-out
          const newSize = Math.min(base * 8, Math.max(base, targetSize * (base / 50)));
          node.style({ width: newSize, height: newSize });
        });
      });
    });

    cyInstance.current = cy;
    cyRef.current      = cy;

    return () => {
      if (zoomRaf) cancelAnimationFrame(zoomRaf);
      clearTimeout(firstPulseTimeout);
      if (pulseRef.current)      { clearInterval(pulseRef.current);           pulseRef.current      = null; }
      if (mentorFlowRef.current) { cancelAnimationFrame(mentorFlowRef.current); mentorFlowRef.current = null; }
      cy.destroy();
      cyInstance.current = null;
    };
  }, [data, filter]); // eslint-disable-line

  return <div ref={containerRef} className="graph-container" />;
}
