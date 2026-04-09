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
]);

const LEGEND_GOLD   = '#FFD700';
const LEGEND_GLOW   = 'rgba(255, 215, 0, 0.55)';
const LEGEND_GLOW_2 = 'rgba(255, 215, 0, 0)';

const TYPE_COLORS = {
  collaborative: '#f97316',
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
const LEGEND_BOOST = 28; // extra px added to legend node radius

// Legend edge length — shorter = stronger gravitational pull
const LEGEND_EDGE_LEN  = 110;
const DEFAULT_EDGE_LEN = 200;

export default function GraphView({ data, filter, artistImages, onNodeSelect, cyRef }) {
  const containerRef = useRef(null);
  const cyInstance   = useRef(null);
  const pulseRef     = useRef(null); // holds the setInterval id for the pulse

  // ── Image application ────────────────────────────────────
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

        // Preserve the legend gold border if applicable
        const isLegend = node.data('isLegend');
        node.style('border-width',   isLegend ? 4 : 3);
        node.style('border-color',   isLegend ? LEGEND_GOLD : node.data('color'));
        node.style('border-opacity', 1);
      };
      img.onerror = () => console.warn(`[CY] Image failed for ${id}`);
      img.src = url;
    });
  }, [artistImages]);

  // ── Full rebuild when data / filter changes ──────────────
  useEffect(() => {
    if (!data || !containerRef.current) return;

    // Stop any previous pulse animation
    if (pulseRef.current) {
      clearInterval(pulseRef.current);
      pulseRef.current = null;
    }

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
      const size     = getSize(a.id);
      const isLegend = a.isLegend === true || LEGEND_IDS.has(a.id);
      elements.push({
        data: {
          id:       a.id,
          label:    a.name,
          era:      a.era,
          region:   a.region,
          color:    isLegend ? LEGEND_GOLD : (ERA_COLORS[a.era] || ERA_COLORS.default),
          size,
          isLegend,
          role:     a.role || 'artist',
        }
      });
    });

    data.relationships.forEach(r => {
      if (filter !== 'all' && r.type !== filter) return;
      const isLegendEdge = LEGEND_IDS.has(r.source) || LEGEND_IDS.has(r.target);
      elements.push({
        data: {
          id:           r.id,
          source:       r.source,
          target:       r.target,
          type:         r.type,
          label:        r.subtype?.replace(/_/g, ' '),
          color:        TYPE_COLORS[r.type] || '#6b7280',
          width:        Math.max(1.5, r.strength * (isLegendEdge ? 5 : 4)),
          isLegendEdge,
        }
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
            'overlay-opacity':     0,  // animated below
            'z-index':             10,
          }
        },

        // ── Legend edges — slightly brighter, thicker ──────
        {
          selector: 'edge[?isLegendEdge]',
          style: {
            'opacity': 0.75,
            'line-style': 'solid',
          }
        },

        {
          selector: 'node:selected',
          style: {
            'border-width':   5,
            'border-color':   '#ffffff',
            'border-opacity': 1,
          }
        },
        {
          selector: '.faded',
          style: { 'opacity': 0.1 }
        },
        {
          selector: '.highlighted',
          style: { 'opacity': 1 }
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

      // ── Cola physics: shorter edges to legend nodes create ─
      // the "gravitational pull" effect — collaborators orbit
      // around the architects rather than drifting away.
      layout: {
        name:                 'cola',
        animate:              true,
        animationDuration:    1600,
        refresh:              2,
        maxSimulationTime:    6000,
        fit:                  true,
        padding:              55,
        nodeSpacing:          32,
        // Edge length function: legend nodes have LEGEND_EDGE_LEN
        // which pulls their neighbors 45% closer than default.
        edgeLength: edge => {
          const src = edge.source().id();
          const tgt = edge.target().id();
          if (LEGEND_IDS.has(src) || LEGEND_IDS.has(tgt)) return LEGEND_EDGE_LEN;
          return DEFAULT_EDGE_LEN;
        },
        // Node mass: heavier legend nodes resist being displaced
        // by the simulation — they anchor their local cluster.
        nodeWeight: node => LEGEND_IDS.has(node.id()) ? 8 : 1,
        randomize:            false,
        avoidOverlap:         true,
        handleDisconnected:   true,
        convergenceThreshold: 0.001,
        centerGraph:          true,
      },

      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    // ── Gold Pulse Animation ───────────────────────────────
    // Like a heartbeat — the legend nodes emit a soft gold glow
    // that expands and fades, drawing the eye to the Architects.
    let pulseExpanding = true;
    const legendNodes  = cy.nodes('[?isLegend]');

    const runPulse = () => {
      const targetOpacity = pulseExpanding ? 0.22 : 0;
      legendNodes.animate(
        { style: { 'overlay-opacity': targetOpacity } },
        { duration: 950, easing: 'ease-in-out', complete: () => { pulseExpanding = !pulseExpanding; } }
      );
    };
    // Kick off first pulse after layout settles
    const firstPulseTimeout = setTimeout(runPulse, 1800);
    pulseRef.current = setInterval(runPulse, 1000);

    // ── Interactions ───────────────────────────────────────
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
      }
    });

    cy.on('mouseover', 'node', () => { containerRef.current.style.cursor = 'pointer'; });
    cy.on('mouseout',  'node', () => { containerRef.current.style.cursor = 'default'; });

    cyInstance.current = cy;
    cyRef.current      = cy;

    return () => {
      clearTimeout(firstPulseTimeout);
      if (pulseRef.current) {
        clearInterval(pulseRef.current);
        pulseRef.current = null;
      }
      cy.destroy();
      cyInstance.current = null;
    };
  }, [data, filter]); // eslint-disable-line

  return <div ref={containerRef} className="graph-container" />;
}
