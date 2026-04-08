import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';

const TYPE_COLORS = {
  collaborative: '#f97316', // orange
  mentorship:    '#22d3ee', // cyan
  collective:    '#a855f7', // purple
  familial:      '#4ade80', // green
};

const NODE_COLORS = {
  '90s':  '#e11d48',
  '2000s':'#f97316',
  '2010s':'#22d3ee',
  '80s':  '#a855f7',
  default:'#6b7280',
};

export default function GraphView({ data, filter, onNodeSelect, cyRef }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!data || !containerRef.current) return;

    // Build elements
    const elements = [];

    data.artists.forEach(a => {
      elements.push({
        data: {
          id: a.id,
          label: a.name,
          era: a.era,
          region: a.region,
          color: NODE_COLORS[a.era] || NODE_COLORS.default,
        }
      });
    });

    data.relationships.forEach(r => {
      if (filter !== 'all' && r.type !== filter) return;
      elements.push({
        data: {
          id: r.id,
          source: r.source,
          target: r.target,
          type: r.type,
          label: r.subtype?.replace(/_/g, ' '),
          color: TYPE_COLORS[r.type] || '#6b7280',
          width: Math.max(1, r.strength * 4),
        }
      });
    });

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'label': 'data(label)',
            'color': '#fff',
            'font-size': '11px',
            'font-family': 'Segoe UI, sans-serif',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 5,
            'width': 40,
            'height': 40,
            'border-width': 2,
            'border-color': '#ffffff22',
            'text-outline-color': '#0a0a0a',
            'text-outline-width': 2,
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#fff',
            'border-width': 3,
            'width': 52,
            'height': 52,
          }
        },
        {
          selector: 'edge',
          style: {
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'width': 'data(width)',
            'opacity': 0.7,
            'label': 'data(label)',
            'font-size': '9px',
            'color': '#aaa',
            'text-background-color': '#0a0a0a',
            'text-background-opacity': 0.6,
            'text-background-padding': '2px',
          }
        },
        {
          selector: 'edge:selected',
          style: { 'opacity': 1, 'width': 'mapData(width, 1, 4, 3, 6)' }
        }
      ],
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 800,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 40,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    // Node click → show sidebar
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const artistData = data.artists.find(a => a.id === node.id());
      if (artistData) onNodeSelect(artistData);

      // Highlight neighbors
      cy.elements().removeClass('faded');
      const neighborhood = node.closedNeighborhood();
      cy.elements().not(neighborhood).addClass('faded');
    });

    // Tap on background → clear selection
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass('faded');
        onNodeSelect(null);
      }
    });

    // Store reference for parent
    cyRef.current = cy;

    // Faded style
    cy.style().fromJson([
      ...cy.style().json(),
      { selector: '.faded', style: { opacity: 0.15 } }
    ]).update();

    return () => cy.destroy();
  }, [data, filter]); // eslint-disable-line

  return <div ref={containerRef} className="graph-container" />;
}
