import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';

cytoscape.use(cola);

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

const MIN_SIZE = 30;
const MAX_SIZE = 80;

export default function GraphView({ data, filter, artistImages, onNodeSelect, cyRef }) {
  const containerRef = useRef(null);
  const cyInstance   = useRef(null);

  // When new images arrive, pre-load each as a JS Image then apply to node
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
        console.log(`[CY] Applied image to ${id}`);
        node.style('background-image',   `url(${url})`);
        node.style('background-fit',     'cover');
        node.style('background-clip',    'node');
        node.style('background-opacity', 1);
        node.style('background-color',   '#1a1a1a');
        node.style('border-width',       3);
        node.style('border-color',       node.data('color'));
        node.style('border-opacity',     1);
      };
      img.onerror = () => console.warn(`[CY] Image failed to load for ${id}: ${url}`);
      img.src = url;
    });
  }, [artistImages]);

  // Full rebuild when graph data or filter changes
  useEffect(() => {
    if (!data || !containerRef.current) return;

    // ── Degree centrality ────────────────────────────────
    const degrees = {};
    data.artists.forEach(a => { degrees[a.id] = 0; });
    data.relationships.forEach(r => {
      if (filter !== 'all' && r.type !== filter) return;
      degrees[r.source] = (degrees[r.source] || 0) + 1;
      degrees[r.target] = (degrees[r.target] || 0) + 1;
    });
    const maxDeg = Math.max(...Object.values(degrees), 1);
    const getSize = id => Math.round(MIN_SIZE + ((degrees[id] || 0) / maxDeg) * (MAX_SIZE - MIN_SIZE));

    // ── Build elements ───────────────────────────────────
    const elements = [];

    data.artists.forEach(a => {
      const size = getSize(a.id);
      elements.push({
        data: {
          id:     a.id,
          label:  a.name,
          era:    a.era,
          region: a.region,
          color:  ERA_COLORS[a.era] || ERA_COLORS.default,
          size,
        }
      });
    });

    data.relationships.forEach(r => {
      if (filter !== 'all' && r.type !== filter) return;
      elements.push({
        data: {
          id:     r.id,
          source: r.source,
          target: r.target,
          type:   r.type,
          label:  r.subtype?.replace(/_/g, ' '),
          color:  TYPE_COLORS[r.type] || '#6b7280',
          width:  Math.max(1.5, r.strength * 4),
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
        {
          selector: 'node:selected',
          style: {
            'border-width':   4,
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
      layout: {
        name:                 'cola',
        animate:              true,
        animationDuration:    1400,
        refresh:              2,
        maxSimulationTime:    5000,
        fit:                  true,
        padding:              50,
        nodeSpacing:          28,
        edgeLength:           190,
        randomize:            false,
        avoidOverlap:         true,
        handleDisconnected:   true,
        convergenceThreshold: 0.001,
        centerGraph:          true,
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    // Node click — pass artist + screen position to parent
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

    // Background click — clear
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
      cy.destroy();
      cyInstance.current = null;
    };
  }, [data, filter]); // eslint-disable-line

  return <div ref={containerRef} className="graph-container" />;
}
