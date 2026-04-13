# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HipHopTree is a full-stack interactive knowledge graph that visualizes relationships between hip-hop artists. It has two independent services:

- **`hiphop-tree-backend/`** — Node.js/Express REST API (runs on port 5001)
- **`hiphop-tree-frontend/`** — React 18 app using Cytoscape.js for graph rendering

## Development Commands

### Backend
```bash
cd hiphop-tree-backend
npm install
cp .env.example .env   # then add GENIUS_API_KEY
npm run dev            # nodemon hot-reload on port 5001
```

Health check: `curl http://localhost:5001/health`

### Frontend
```bash
cd hiphop-tree-frontend
npm install
echo "REACT_APP_API_URL=http://localhost:5001/api" > .env.local
npm start              # CRA dev server on port 3000
npm run build          # production build to build/
```

### Utility Scripts
```bash
# Patch Spotify preview URLs into graph.json (one-shot)
cd hiphop-tree-backend
SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node fetch-previews.js
# Or with .env: node -r dotenv/config fetch-previews.js
```

## Architecture

### Data Layer
All artist/relationship data lives in **`hiphop-tree-backend/graph.json`**. This is the single source of truth — the backend reads it at startup and serves it unchanged via `GET /api/graph`. There is no database required for local dev; PostgreSQL (via Supabase) is optional and used only for caching external API responses.

**Artist node shape**: `{ id, name, aliases, eras, regions, roles, metadata: { wikidataId? } }`

**Relationship shape**: `{ id, source, target, type, subtype, strength (0–1), verified, sources, metadata: { songs, count, startYear }, year?, audio_metadata? }`

Relationship `type` is one of: `collaborative`, `mentorship`, `collective`, `familial`.

### Backend (`server.js`)
Express app with no database dependency by default. Key endpoints:
- `GET /api/graph` — full graph JSON
- `GET /api/search?q=` — artist name search
- `GET /api/artist/:id` — artist + connections
- `GET /api/path?from=X&to=Y` — BFS shortest path between two artists
- `GET /api/wiki-image/:name` — Wikipedia thumbnail (multi-strategy, cached)
- `POST /api/wiki-image-batch` — batch image fetch for prefetching
- `GET /api/proxy-image?url=` — proxies external images to avoid CORS
- `GET /api/wiki-bio/:name` — Wikipedia intro extract
- `GET /api/wikidata/artist/:name` — Wikidata relationships (family, labels, influences) via SPARQL
- `GET /api/wikidata/collective/:name` — collective members from Wikidata
- `GET /api/wikidata/producer-credits/:name` — reverse-lookup: artists a producer has worked with
- `GET /api/verify/genius?artist1=&artist2=` — search Genius for collaboration evidence

**Caching (`cache.js`)**: Supabase `artist_cache` table with 7-day TTL and stale-while-revalidate. If `SUPABASE_URL`/`SUPABASE_ANON_KEY` are absent, caching silently becomes a no-op — every request falls through to live external APIs.

### Frontend (`src/`)
- **`App.js`** — root component; owns all state, fetches graph data, orchestrates child components
- **`GraphView.js`** — Cytoscape.js graph; handles node rendering, layout (cola physics), edge animations (mentorship marching-ants), legend/deep-cut visual logic
- **`Sidebar.js`** — artist detail panel (bio, connections, Wikidata panel)
- **`WikidataPanel.js`** — fetches and displays Wikidata relationships for selected artist
- **`LandingPage.js`** — full-screen intro with dissolve transition into the graph
- **`SearchBar.js`**, **`HistorySlider.js`**, **`AudioPreviewPlayer.js`** — focused UI components

**Key frontend concepts:**
- `LEGEND_IDS` — hardcoded set of "Verified Architect" producer IDs in both `App.js` and `GraphView.js` (must be kept in sync)
- `flagDeepCuts()` — computes which artists are "Deep Cuts" (below-median degree, connected to a Legend but not one themselves)
- Image prefetch: on load, App batches all artists into chunks of 20 and calls `/api/wiki-image-batch`, then proxies returned URLs through `/api/proxy-image`
- `activeYear` + History Slider: filters edges by `relationship.year <= activeYear`
- `focusedCollective`: dims all nodes not in the selected collective

### Optional Supabase Schema (`supabase-schema.sql`)
Defines a producer-centric PostgreSQL schema for scaling beyond JSON — `artists`, `relationships`, `eras`, `producer_eras`, `artist_cache` tables, plus a `flag_deep_cuts()` stored function that mirrors the frontend `flagDeepCuts()` logic.

## Environment Variables

### Backend (`.env`)
```
GENIUS_API_KEY=          # required for /api/verify/genius and /api/genius/artist/:name
SUPABASE_URL=            # optional — enables caching
SUPABASE_ANON_KEY=       # optional — enables caching
SPOTIFY_CLIENT_ID=       # optional — only used by fetch-previews.js script
SPOTIFY_CLIENT_SECRET=   # optional — only used by fetch-previews.js script
PORT=5001                # default
```

### Frontend (`.env.local`)
```
REACT_APP_API_URL=http://localhost:5001/api
```

## Adding Data

To add artists or relationships, edit **`hiphop-tree-backend/graph.json`** directly, then restart the backend (`npm run dev`). Relationship IDs follow the pattern `rel_NNN` (increment the last used number). Artist IDs are kebab-case names (e.g., `kendrick-lamar`).

To add a new "Verified Architect" (Legend), add the artist ID to `LEGEND_IDS` in both `hiphop-tree-frontend/src/App.js` and `hiphop-tree-frontend/src/GraphView.js`.

## Hip Hop Tree Quality Standards & Health Checks
- **Data Integrity:** Every artist node in `graph.json` must have a valid `wikidataId`, `bio`, and `wikipediaUrl`.
- **Mentorship Logic:** A 'mentorship' or 'discovered_by' relationship must point from a chronologically older/established artist to a younger/newer one.
- **Sonic Link Validation:** Any edge with `has_audio: true` must contain a valid `preview_url` and `song_title\`.
- **Legend Sync:** Any artist added to `LEGEND_IDS` in `App.js` must also exist in `GraphView.js` and have a node in `graph.json`.
- **Performance:** If the total node count in `graph.json` exceeds 200, flag for "Cluster View" implementation.

## Maintenance Commands
- **Check Health:** `node scripts/audit-graph.js` (or ask Claude to scan manually)
- **Fix Data:** Use `fill-missing-data.js` to resolve integrity issues.
