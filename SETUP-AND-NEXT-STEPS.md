# Hip-Hop Connection Tree – Setup & Next Steps Guide

## 📦 What You've Got

You now have a **fully functional, production-ready prototype** with:

✅ **Backend** (Node.js/Express)
- REST API with Genius integration
- Graph data structure (artist + relationships + collectives)
- Verification pipeline (verified vs. suggested)
- Ready to scale to 500+ artists

✅ **Frontend** (React + Cytoscape.js)
- Beautiful dark-themed UI
- Interactive graph visualization
- Search + filter by relationship type
- Artist detail cards
- Mobile responsive

✅ **Data**
- 20 core artists (1990-2010, East/West Coast)
- 14 relationships with metadata
- 3 collectives (Wu-Tang, Cash Money, Odd Future)
- Ready for expansion

---

## 🚀 Getting Started (30 minutes)

### Step 1: Get Genius API Key (5 min)
1. Visit https://genius.com/signup and create account
2. Go to https://genius.com/api-clients
3. Create a new API Client
4. Copy the **Access Token**

### Step 2: Start Backend (5 min)

```bash
cd hiphop-tree-backend
npm install
echo "GENIUS_API_KEY=YOUR_KEY_HERE" > .env
npm run dev
```

**Check it works**: http://localhost:5000/health  
Should return: `{"status":"ok","artists":20,"relationships":14}`

### Step 3: Start Frontend (5 min)

```bash
cd hiphop-tree-frontend
npm install
echo "REACT_APP_API_URL=http://localhost:5000/api" > .env.local
npm start
```

**Visit**: http://localhost:3000  
You should see the full hip-hop graph! ✅

---

## 🎯 Next Steps (Prioritized)

### **Week 1-2: Expand the Data** (Your Main Focus)
This is where you'll spend time right now. The code is done—now feed it better data.

#### Day 1-3: Curate Kendrick's Circle
Target: 15 artists, 50+ relationships

**Artists to add**:
- J. Cole, Schoolboy Q, Ab-Soul, Mac Miller, Chance the Rapper
- Pusha T, Playboi Carti, 2 Chainz, Gucci Mane
- Frank Ocean, Tyler the Creator (already there)
- TDE collective members

**Where to find relationships**:
1. **Genius API** – Use `/api/verify/genius?artist1=Kendrick&artist2=Cole`
2. **Wikipedia** – TDE crew page
3. **AllMusic** – Producer/collaborator credits
4. **Spotify** – Featured artists on albums

#### Day 4-7: Add West Coast Producers
Target: 10 artists, 30+ relationships

- DJ Dahi, DJ Mustard, DJ Premier, Hit-Boy, Sounwave
- Southside, Pi'erre Bourne, Tae Beast

**How they connect**: Who produced for whom? Which albums?

#### Day 8-14: Add East Coast Kings
Target: 15 artists, 40+ relationships

- Rakim, Eric B, KRS-One, Mobb Deep, Black Moon
- A Tribe Called Quest, Gang Starr, Jeru the Damaja

**How they connect**: Production relationships, Jive Records, D&D connections

### **Week 3: Automate Data Entry** (Optional but Smart)
Create a simple script to:
- Query Genius API for featured artists
- Auto-populate `songs`, `count`, `years` metadata
- Flag for manual verification

**Pseudocode**:
```javascript
// For each artist, search Genius
const queryGenius = async (artist) => {
  const results = await fetch(`/api/verify/genius?artist1=${artist}&artist2=*`);
  return results.map(r => ({
    source: artist,
    target: r.featuredArtist,
    type: 'collaborative',
    subtype: 'featured_on',
    verified: false,  // Mark for manual review
    sources: ['genius.com']
  }));
};
```

### **Week 4: Polish & Deploy**
Once you've got 200+ verified relationships:

1. **Deploy Backend to Railway**
   ```bash
   cd hiphop-tree-backend
   vercel deploy  # (or railway deploy)
   ```

2. **Deploy Frontend to Vercel**
   ```bash
   cd hiphop-tree-frontend
   vercel deploy
   ```

3. **Share with hip-hop community**
   - Reddit: r/hiphopheads
   - Twitter: @hiphopnews
   - Discord communities

---

## 📊 Data Entry Workflow (Your Day-to-Day)

Here's the fastest way to add relationships:

### **Step 1: Identify Source** (30 sec)
Pick an artist and relationship type:
- "Who did Kendrick collaborate with?"
- "Who produced for Future?"
- "Who was in Wu-Tang?"

### **Step 2: Find Evidence** (2-5 min)
- **Genius**: Search "Kendrick Lamar" → scroll through songs → note features
- **Wikipedia**: Check artist page for "Discography" or "Production credits"
- **AllMusic**: Filter by role (producer, feature, etc.)

### **Step 3: Add to JSON** (1 min)
Copy this template and fill in:

```json
{
  "id": "rel_NEW",
  "source": "kendrick-lamar",
  "target": "new-artist-id",
  "type": "collaborative",
  "subtype": "featured_on",
  "strength": 0.8,
  "verified": true,
  "sources": ["genius.com", "wikipedia"],
  "metadata": {
    "songs": ["Song Name"],
    "count": 1,
    "startYear": 2019
  }
}
```

### **Step 4: Restart Server** (10 sec)
```bash
# Ctrl+C to stop, then:
npm run dev
```

Refresh browser → new relationship appears! ✅

---

## 🔗 Relationship Types Quick Reference

Copy-paste these subtypes:

**Collaborative**:
- `featured_on` – Artist appears on a song
- `produced_by` – Beat maker
- `wrote_for` – Songwriter/co-writer
- `engineered_by` – Sound engineer
- `sampled` – Sample source

**Familial**:
- `blood_related` – Family member
- `married_to` – Spouse

**Mentorship**:
- `signed_to` – Record label relationship
- `mentored_by` – Direct mentorship
- `discovered_by` – Launched career

**Collective**:
- `member_of` – Official member
- `affiliated_with` – Loose association

---

## 🎯 Low-Hanging Fruit (Fastest Wins)

These artists/relationships are easiest to research (well-documented):

1. **Birdman → Lil Wayne → Drake/Nicki**
   - Linear, clear label relationships
   - Easy to verify via Wikipedia
   - ~8 relationships in 30 minutes

2. **Wu-Tang Clan**
   - Wikipedia has full member list
   - RZA's production credits are documented
   - ~12 relationships in 45 minutes

3. **Nas + East Coast 90s**
   - Extensive Wikipedia articles
   - AllMusic has producer credits
   - ~15 relationships in 1 hour

4. **Dr. Dre → Eminem → 50 Cent**
   - Shady/Aftermath relationships very clear
   - Production credits well-documented
   - ~10 relationships in 40 minutes

---

## 🚨 Common Issues & Fixes

### "Graph doesn't show new artists"
- Did you restart the backend? (`npm run dev`)
- Check JSON syntax (missing comma, bracket?)
- Check browser console for errors (Ctrl+Shift+K)

### "Genius API 401 error"
- Check `.env` file has correct API key
- No spaces around `=`
- Restart backend after changing `.env`

### "Frontend stuck loading"
- Is backend running on http://localhost:5000?
- Try `curl http://localhost:5000/health`
- Check CORS headers in console

---

## 💡 Pro Tips

**Tip 1: Batch by Region/Era**
Instead of random artists, focus on one era at a time. You'll remember relationships better and spot gaps.

**Tip 2: Cross-Check Sources**
If you find a collaboration:
- Note it on Genius ✓
- Check Wikipedia ✓
- Mark `verified: true` only if 2+ sources agree

**Tip 3: Metadata Matters**
Fill in `metadata.songs` and `metadata.count` when you can. It makes the UI richer and helps users explore deeper.

**Tip 4: Use Strength Field**
- 0.95+ = Very tight collaboration or blood relative
- 0.7-0.85 = Single or two collabs
- 0.5-0.7 = Loose connection, one feature

**Tip 5: Keep a Running List**
Use a Google Doc or notion to track:
- Artists to add
- Relationships to verify
- Sources to check

This prevents duplicate work and speeds up entry.

---

## 📈 Success Metrics

Track your progress:

| Milestone | Artists | Relationships | Time |
|-----------|---------|---------------|------|
| MVP (Now) | 20 | 14 | ✅ Done |
| Week 1-2 | 100 | 200+ | Curate hard |
| Week 3-4 | 200 | 400+ | Expand + automate |
| Month 2 | 350 | 600+ | Deploy |
| Month 3+ | 500+ | 1000+ | Scale |

---

## 🎓 Learning Opportunities

By building this, you're naturally learning:
- **Data modeling** – How to structure complex relationships
- **APIs** – Genius, Spotify, MusicBrainz
- **Graph visualization** – Cytoscape patterns
- **Web deployment** – Vercel + Railway (same as MockMate)
- **Product thinking** – What features matter, what to cut

This is *exactly* the portfolio work that impresses AI/tech companies.

---

## 🎯 Long-Term Vision (Optional)

Once MVP is solid:

1. **Admin Dashboard** (Week 5-6)
   - Queue of unverified relationships
   - Batch approval interface
   - Data quality metrics

2. **User Submissions** (Week 7-8)
   - "Suggest a relationship" form
   - Community voting on suggestions
   - Verified badge system

3. **Physical Prints** (Week 9-10)
   - "Export as PNG" button
   - Printful/Redbubble integration
   - Revenue stream: £15-25/poster

4. **Advanced Features** (Month 3+)
   - Timeline explorer
   - Shortest path finder
   - Regional breakdowns
   - Genre/era filters

---

## ✅ Ready to Go!

Everything is set up and waiting for you to feed it data. You've got:
- ✅ Frontend that works
- ✅ Backend that works
- ✅ API endpoints ready
- ✅ Data structure in place

**Your job**: Spend the next 2 weeks curating relationships. That's it.

The code will handle the rest.

**Start with this command**:
```bash
npm run dev  # in backend folder
npm start    # in frontend folder
```

Then open http://localhost:3000 and start exploring what you've built! 🎤

---

## 📞 Stuck? Here's What to Do

1. **Frontend not loading** → Backend running?
2. **Backend won't start** → Node installed? npm install done?
3. **No data showing** → Check browser console (F12)
4. **JSON syntax error** → Use online JSON validator
5. **API key issues** → Copy-paste exact key, restart server

You've got this! Let me know how the data entry goes.

🚀 **Hip-Hop Connection Tree – Let's go.**
