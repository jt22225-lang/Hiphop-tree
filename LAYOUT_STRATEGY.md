# HipHopTree Layout Strategy: Producer Perimeter Prison

## Core Concept

The graph uses a **gravitational hierarchy** where producers and key creative architects form a locked outer ring, while rappers/artists cluster around gravity wells toward the center. This creates a natural visualization of creative influence flow.

## Architectural Principles

### 1. Producer Perimeter Prison
**Purpose:** Lock producers in a fixed decagon (10-sided ring) on the outer boundary

**Implementation:**
- Producers are positioned at fixed coordinates around a circle
- They are **locked** via `node.lock()` — Cola physics cannot move them
- They are **ungrabified** — users cannot drag them
- They act as immobile gravity wells

**Visual Result:**
- Producers form an anchor ring around the entire graph
- All edges from rappers to producers extend outward like spokes
- Creates a stable "solar system" effect with hubs as planets

**Who Gets Locked:**
- All members of `LEGEND_IDS` (Verified Architects: Kanye, DJ Premier, Dilla, etc.)
- All artists with `role='producer'` in the data
- Additional key figures added to `PRODUCER_PERIMETER_IDS`

### 2. Epoch-Based Radial Pre-Positioning
**Purpose:** Seed initial positions based on era, then let Cola optimize

**Epoch Rings (Model Space):**
```
Genesis (1979–89)      → radius 500px   (closest to edge)
Golden Era (1990–99)   → radius 1300px
Blog Era (2000–09)     → radius 2300px
Streaming (2010–)      → radius 3600px  (center area)
```

**How It Works:**
1. Artists are pre-positioned at their era's radius + random angle
2. Cola layout runs, with gravity pulling all nodes toward center
3. Producers stay locked on outer ring, acting as gravity anchors
4. Rappers settle into clusters between era bands

**Result:**
- Natural timeline visualization (outer = older, inner = newer)
- Era-specific clustering without explicit clustering code
- Temporal flow is emergent from physics

### 3. Cola Physics Configuration

**Current Settings (Phase 26):**

| Parameter | Value | Purpose |
|-----------|-------|---------|
| **nodeSpacing** | 500 | Minimum distance nodes repel each other (avoidOverlap) |
| **gravity** | 35 | Center attraction strength (weaker = more spread) |
| **padding** | 200 | Canvas edge margins |
| **maxSimulationTime** | 5000ms | Settlement time for 571 artists |
| **convergenceThreshold** | 0.003 | Physics stop condition |
| **avoidOverlap** | true | Nodes repel based on size + nodeSpacing |

**Node Weights:**
```javascript
Producers (locked)     → weight 50  (high mass = repels others)
Hub nodes (collectives)→ weight 20  (cluster anchors)
Regular rappers        → weight 1   (drift freely)
```

**Edge Lengths:**
```javascript
Producer ↔ Rapper edges → 6000px  (dramatic long tethers)
Collective member edges → 55–70px (tight clusters)
Collaborations         → 200px    (flexible distance)
```

### 4. Zoom & Viewport Management

**Zoom Range:**
- **minZoom:** 0.005 — Can zoom out to see entire 571-artist constellation
- **maxZoom:** 10 — Deep zoom for individual nodes

**Fit Padding:**
- On layout finish: `cy.fit(undefined, 200px)` — generous breathing room
- TDE focus: `cy.fit(tdeNodes, 80px)` — tighter for cluster view

## How Influence Flows Visually

```
            🎤 DJ Premier (locked outer ring)
           /           |           \
        Producer      Producer    Producer
         edge        edge          edge
        (6000px)    (6000px)      (6000px)
          /             |            \
       Collab ---- Collaboration ---- Collab
       (200px)      mentorship        (200px)
                    (200px)
                      |
                  Rapper Hub
                    (center)
                      |
                   Younger Artists
                   (cluster together)
```

## Current Graph Statistics (571 Artists)

- **Producers/Architects:** ~25 (locked perimeter)
- **Hub Nodes (Collectives):** ~15 (high mass, central anchors)
- **Regular Artists:** ~531 (free-floating, clustered by era/relationship)
- **Relationships:** 600+ (collaborative, mentorship, familial, collective)

## Customization Points

### To Add/Remove Artists:
```javascript
// In graph.json
{ "id": "artist-id", "name": "Name", "era": "2010s" }
```

### To Add a New Producer:
```javascript
// In GraphView.js PRODUCER_PERIMETER_IDS
'artist-id'  // will be locked to perimeter
```

### To Hide Artists (Temporarily):
```javascript
// In GraphView.js HIDDEN_ARTIST_IDS
'nines',  // UK artist — pending UK expansion
'knucks'  // UK artist — pending UK expansion
```

### To Adjust Physics (For Different Graph Sizes):
```javascript
// In GraphView.js layout config
nodeSpacing: 500,    // increase for more spread
gravity: 35,         // decrease for looser clustering
maxSimulationTime: 5000  // increase for larger graphs
```

## Philosophy: Why This Design?

1. **Respect Influence Hierarchy**
   - Producers are anchors, not floating nodes
   - Their position signals their role as gravity wells
   - Locked perimeter prevents visual chaos

2. **Temporal Awareness**
   - Epoch rings encode timeline without explicit labels
   - Older eras naturally appear on periphery
   - Streaming generation clusters in center

3. **Scalability**
   - Works for 50 artists or 500+
   - Producers always stay visible (locked perimeter)
   - Physics settles naturally regardless of graph density

4. **Exploration Incentive**
   - Large empty spaces encourage zoom/pan
   - Perimeter producers are always reachable
   - Center clusters reward deep dives

## Future Enhancements

- **UK Expansion:** Unhide 'nines', 'knucks' when regional features ship
- **Breadcrumb Layout:** Alternative "timeline as horizontal line" for sequential viewing
- **Collective Focus Zoom:** Auto-adjust padding when filtering to a label/collective
- **Dynamic Epoch Rings:** Draw era boundaries based on actual relationship year data (not hardcoded)

## Console Tools (for debugging)

```javascript
window.resetLayout()  // Re-run Cola from current positions
window.fitTDE()       // Zoom to TDE members cluster
window.stopCurrentLayout()  // Cancel in-flight physics
```

---

**Last Updated:** April 2026 (Phase 26: 571-artist layout)
