# 🎤 Hip-Hop Connection Tree

An interactive knowledge graph explorer that visualizes relationships between hip-hop artists across generations and regions.

**Live Demo**: Coming soon to Vercel + Railway  
**MVP Status**: ✅ Fully functional prototype (1990-2010 East/West Coast, 20 core artists, 14 relationships)

---

## 🎯 Project Overview

This is a **general explorer** for anyone curious about hip-hop history. Explore how artists connect through:
- **Collaborations** (featured on, produced, wrote for)
- **Family Ties** (blood relatives, marriages)
- **Mentorship** (signed to, discovered by, mentored)
- **Collectives** (Wu-Tang Clan, Cash Money Records, Odd Future)

### Key Features
- 📊 Interactive graph with pan/zoom/search
- 🔍 Filter by relationship type
- ✅ Verified vs. suggested relationships (crowdsource-ready)
- 🎨 Beautiful dark theme optimized for artists
- 📱 Mobile-responsive design
- 🚀 Ready to scale to 500+ artists

---

## 🛠️ Tech Stack

### Frontend
- **React 18** – UI framework
- **Cytoscape.js** – Knowledge graph visualization
- **Tailwind CSS** – Styling
- **Vercel** – Deployment

### Backend
- **Node.js / Express** – REST API
- **Genius API** – Artist data + verification
- **Railway** – Deployment

### Data
- **JSON** (graph.json) – Artist/relationship data
- **PostgreSQL** (optional) – For production scale

---

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- Git

### Local Development

#### 1. Backend Setup

```bash
cd hiphop-tree-backend
npm install
cp .env.example .env
# Add your Genius API key to .env: GENIUS_API_KEY=your_key_here
npm run dev
# Server runs on http://localhost:5000
```

**Get a Genius API Key**:
1. Go to https://genius.com/signup
2. Create an account
3. Navigate to https://genius.com/api-clients
4. Create a new API Client
5. Copy the **Access Token** and add to `.env`

#### 2. Frontend Setup

```bash
cd hiphop-tree-frontend
npm install
echo "REACT_APP_API_URL=http://localhost:5000/api" > .env.local
npm start
# Frontend runs on http://localhost:3000
```

Visit **http://localhost:3000** and you should see the full graph!

---

## 📊 Data Structure

### Artist Object
```json
{
  "id": "kendrick-lamar",
  "name": "Kendrick Lamar",
  "aliases": ["K. Dot", "Kung Fu Kenny"],
  "image": "url_to_image",
  "eras": ["2010s", "2020s"],
  "regions": ["West Coast", "Compton"],
  "roles": ["rapper", "songwriter", "producer"],
  "spotifyId": "..."
}
```

### Relationship Object
```json
{
  "id": "rel_001",
  "source": "kendrick-lamar",
  "target": "metro-boomin",
  "type": "collaborative",
  "subtype": "produced_by",
  "strength": 0.85,
  "verified": true,
  "sources": ["genius.com", "spotify"],
  "metadata": {
    "songs": ["HUMBLE.", "Backroads"],
    "count": 8,
    "startYear": 2013,
    "endYear": 2024
  }
}
```

### Relationship Types
- **collaborative**: `featured_on`, `produced_by`, `wrote_for`, `engineered`, `sampled`
- **familial**: `blood_related`, `married_to`
- **mentorship**: `signed_to`, `mentored_by`, `discovered_by`
- **collective**: `member_of`, `affiliated_with`, `co_founded`

---

## 🔧 API Endpoints

### Public Endpoints

**Get Full Graph**
```bash
GET /api/graph
```
Returns all artists, relationships, and collectives.

**Search Artists**
```bash
GET /api/search?q=kendrick
```
Returns matching artists.

**Get Artist Details**
```bash
GET /api/artist/kendrick-lamar
```
Returns artist + all their connections.

**Verify via Genius**
```bash
GET /api/verify/genius?artist1=Kendrick&artist2=Metro
```
Search Genius for collaboration evidence.

### Admin Endpoints (Future)

**Suggest Relationship**
```bash
POST /api/relationships/suggest
Body: { source, target, type, subtype, notes }
```

**Verify Relationship**
```bash
POST /api/relationships/:id/verify
Body: { sources: ["genius.com", "spotify"] }
```

---

## 📈 Scaling to 500 Artists

### Phase 1: Data Enrichment (2-3 weeks)
1. Use Genius API to auto-pull featured artists
2. Manually verify and add relationships
3. Mark each with `verified: true/false`

### Phase 2: Migration (1 week)
1. Move data from JSON to PostgreSQL
2. Create admin dashboard for verification
3. Add submission/voting on suggested relationships

### Phase 3: Features (2-3 weeks)
- Shortest path finder ("How does Kendrick connect to Nas?")
- Timeline slider (explore by decade)
- Regional maps
- Curated journeys ("The Kendrick Universe")

---

## 💰 Monetization: Physical Prints

Users can export/order a personalized A3 poster of their explored graph for ~£15-25.

**Implementation Path**:
1. Add "Export as PNG" button (frontend)
2. Integrate with **Printful** or **Redbubble** API
3. Create custom Shopify store
4. Marketing hook: "Get your hip-hop connection tree on your wall"

---

## 📝 Curation Strategy

### Your Data-Building Process
1. **Search**: Query Genius API for relationships
2. **Verify**: Cross-reference sources (Wikipedia, AllMusic, Genius)
3. **Confirm**: Manual review before marking `verified: true`
4. **Store**: JSON + metadata tracking

### Tools to Use
- **Genius API** – Featured artist credits
- **MusicBrainz API** – Relationships, producer info
- **Spotify API** – Metadata, images
- **Wikipedia** – Historical context, family connections

### Suggested Initial Focus (Fastest to Curate)
1. **Kendrick's Circle** (10 artists, deep)
2. **Wu-Tang Clan + East Coast** (10 artists)
3. **Birdman → Lil Wayne → Drake/Nicki** (8 artists, linear)
4. **Dr. Dre → Tupac → West Coast** (8 artists)

These 36 artists can yield 100+ verified relationships in 2-3 weeks of focused curation.

---

## 🎨 Design Philosophy

- **Dark Theme** – Hip-hop aesthetic, artist-focused
- **Orange/Gold Accents** – High energy, record label vibes
- **Clear Hierarchy** – Graph first, details on demand
- **No Fluff** – Functional, beautiful, zero bloat

---

## 📦 Deployment

### Frontend (Vercel)
```bash
cd hiphop-tree-frontend
vercel deploy
# Set env var: REACT_APP_API_URL=https://your-backend.com/api
```

### Backend (Railway)
```bash
cd hiphop-tree-backend
railway deploy
# Add env vars:
# GENIUS_API_KEY=...
# NODE_ENV=production
# PORT=5000
```

---

## 🤝 Contributing

Eventually: User submissions for missing artists/relationships.

For now: Curate the data yourself using the tools outlined above.

---

## 📞 Support

- Issues? Check the GitHub issues
- Ideas? Create a discussion

---

## 📜 License

MIT – Feel free to fork and adapt.

---

## 🚀 Roadmap

**Phase 1 (Now)**: MVP – 500 artists, verified relationships  
**Phase 2 (Week 4-6)**: Timeline, shortest path, regional views  
**Phase 3 (Month 2)**: User submissions, verification queue  
**Phase 4 (Month 3)**: Physical prints, Shopify integration  
**Phase 5 (Month 4+)**: Mobile app, advanced discovery features  

---

**Built by**: You 🎤  
**For**: Hip-hop fans, music historians, and curious explorers  
**Status**: 🚀 Live and growing
