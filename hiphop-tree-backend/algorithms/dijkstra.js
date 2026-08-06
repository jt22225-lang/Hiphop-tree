/**
 * Dijkstra's Algorithm for Shortest Path
 *
 * Finds the shortest path between two artists in the hip-hop graph.
 * - Unweighted (MVP): counts hops regardless of relationship strength
 * - Prepared for weighted: can use relationship strength (0-1) as weights
 *
 * Returns: { path, hops, totalWeight }
 */

/**
 * Binary Min-Heap Priority Queue
 * O(log n) insertion and extraction for optimal Dijkstra performance
 */
class PriorityQueue {
  constructor() {
    this.heap = [];
  }

  // O(log n) insertion with upheap operation
  enqueue(element, priority) {
    this.heap.push({ element, priority });
    this._bubbleUp(this.heap.length - 1);
  }

  // O(log n) extraction with downheap operation
  dequeue() {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop();

    const min = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._bubbleDown(0);
    return min;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  // Bubble up: restore heap property after insertion
  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].priority < this.heap[parentIndex].priority) {
        [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  // Bubble down: restore heap property after extraction
  _bubbleDown(index) {
    while (true) {
      let minIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (leftChild < this.heap.length && this.heap[leftChild].priority < this.heap[minIndex].priority) {
        minIndex = leftChild;
      }
      if (rightChild < this.heap.length && this.heap[rightChild].priority < this.heap[minIndex].priority) {
        minIndex = rightChild;
      }

      if (minIndex !== index) {
        [this.heap[index], this.heap[minIndex]] = [this.heap[minIndex], this.heap[index]];
        index = minIndex;
      } else {
        break;
      }
    }
  }
}

/**
 * Build adjacency map from graph data
 * Returns: { [artistId]: [{ id, rel }, ...] }
 */
function buildAdjacencyMap(graphData) {
  const adjMap = {};

  // Initialize all artists
  graphData.artists.forEach(a => {
    adjMap[a.id] = [];
  });

  // Add bidirectional edges (undirected graph)
  graphData.relationships.forEach(r => {
    if (adjMap[r.source] && adjMap[r.target]) {
      adjMap[r.source].push({ id: r.target, rel: r });
      adjMap[r.target].push({ id: r.source, rel: r });
    }
  });

  return adjMap;
}

/**
 * Dijkstra's Algorithm for shortest path
 *
 * @param {Object} graphData - { artists: [], relationships: [] }
 * @param {String} startId - Start artist ID
 * @param {String} endId - End artist ID
 * @param {Boolean} useWeights - If true, use relationship.strength as edge weight (1 - strength, inverted)
 * @returns {Object} { path: [{from, to, rel}, ...], hops: number, totalWeight?: number }
 */
function dijkstra(graphData, startId, endId, useWeights = false) {
  // Validate input
  if (!startId || !endId) {
    return { path: null, hops: 0, error: 'Start and end IDs required' };
  }

  // Same artist
  if (startId === endId) {
    return { path: [], hops: 0, totalWeight: 0 };
  }

  // Check artists exist
  const artists = new Set(graphData.artists.map(a => a.id));
  if (!artists.has(startId) || !artists.has(endId)) {
    return { path: null, hops: 0, error: 'Artist not found' };
  }

  const adjMap = buildAdjacencyMap(graphData);

  // Distance map and parent map for path reconstruction
  const distances = {};
  const parents = {};
  const visited = new Set();

  // Initialize distances
  graphData.artists.forEach(a => {
    distances[a.id] = a.id === startId ? 0 : Infinity;
    parents[a.id] = null;
  });

  const pq = new PriorityQueue();
  pq.enqueue(startId, 0);

  while (!pq.isEmpty()) {
    const { element: current } = pq.dequeue();

    if (visited.has(current)) continue;
    visited.add(current);

    // Found target
    if (current === endId) break;

    const neighbors = adjMap[current] || [];

    for (const neighbor of neighbors) {
      if (visited.has(neighbor.id)) continue;

      // Calculate edge weight
      // Unweighted: weight = 1 (all edges equal)
      // Weighted: weight = 1 - strength (lower strength = longer path, inverted)
      const weight = useWeights
        ? 1 - (neighbor.rel.strength || 0.5)
        : 1;

      const newDistance = distances[current] + weight;

      if (newDistance < distances[neighbor.id]) {
        distances[neighbor.id] = newDistance;
        parents[neighbor.id] = { prev: current, rel: neighbor.rel };
        pq.enqueue(neighbor.id, newDistance);
      }
    }
  }

  // No path found
  if (distances[endId] === Infinity) {
    return { path: null, hops: 0, error: 'No path found' };
  }

  // Reconstruct path
  const pathEdges = [];
  let current = endId;
  let totalWeight = 0;

  while (parents[current] !== null) {
    const { prev, rel } = parents[current];
    pathEdges.unshift({ from: prev, to: current, rel });

    const weight = useWeights ? 1 - (rel.strength || 0.5) : 1;
    totalWeight += weight;

    current = prev;
  }

  // For unweighted, hops = number of edges
  const hops = pathEdges.length;

  return {
    path: pathEdges,
    hops,
    totalWeight: useWeights ? totalWeight : undefined,
  };
}

module.exports = { dijkstra };
