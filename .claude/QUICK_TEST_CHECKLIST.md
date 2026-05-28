# Game Mode - Quick Test Checklist

## ✅ Pre-Test Setup

- [ ] Backend running: `cd hiphop-tree-backend && npm run dev`
- [ ] Verify backend ready: `curl http://localhost:5001/health`
- [ ] Frontend running: `cd hiphop-tree-frontend && npm start`
- [ ] Browser at `http://localhost:3000`
- [ ] DevTools open: **F12 → Console tab**

## 🎮 Test Flow

### Step 1: Enter Game Mode
- [ ] Click **🎮 Game Mode** button in header (top right)
- [ ] Should see: "🎮 Shortest Path Challenge" panel on right
- [ ] Console should show: **No red errors**

### Step 2: Select First Artist
- [ ] Type "Dr" in artist search box
- [ ] Click **Dr. Dre** from dropdown
- [ ] **Expected**:
  - [ ] Artist search clears
  - [ ] "Dr. Dre" appears in slot with ✕ button
  - [ ] New search box appears for Artist 2
  - [ ] **Console shows**: `[Game] Artist selected: Dr. Dre, Total selected: 1`

### Step 3: Select Second Artist
- [ ] Type "Kendrick" in Artist 2 search box
- [ ] Click **Kendrick Lamar** from dropdown
- [ ] **Expected**:
  - [ ] Artist search clears
  - [ ] Both artists show in "VS" display
  - [ ] **IMPORTANT**: Game should auto-transition to gameplay within 1 second
  - [ ] **Console shows**:
    ```
    [Game] Artist selected: Kendrick Lamar, Total selected: 2
    [Game] Auto-starting game with: ['dr-dre', 'kendrick-lamar']
    [Game] ShortestPathGame initialized { artist1: "Dr. Dre", artist2: "Kendrick Lamar", ... }
    [Game] Found X relationships for dr-dre
    [Game] Available next artists: ...
    ```

### Step 4: Verify Game Play Panel
- [ ] Panel title changes to "🎮 Find the Connection"
- [ ] **Hop Counter** displays "0" in large orange text
- [ ] **Artist Display** shows:
  - [ ] Dr. Dre with green highlight (active)
  - [ ] Arrow (→) symbol
  - [ ] Kendrick Lamar (target)
- [ ] **Next Connections** section shows available artists as clickable buttons
  - [ ] Should show 4-8 buttons (Dr. Dre's collaborators)
  - [ ] Each button shows artist name and relationship type
  - [ ] One button should be highlighted differently (if it's the target)

### Step 5: Click Through Path
- [ ] Click an available artist button (e.g., "Eminem")
- [ ] **Expected**:
  - [ ] Hop counter increments to "1"
  - [ ] "Your Path" section appears showing: Dr. Dre → Eminem
  - [ ] New available artists appear (Eminem's collaborators)
  - [ ] **Console shows**: `[Game] User clicked path: { from: "dr-dre", to: "eminem", targetReached: false }`

- [ ] Click another artist to continue path
  - [ ] Counter increments again
  - [ ] Path continues to show all hops

### Step 6: Reach Target
- [ ] Continue clicking until you reach Kendrick Lamar
- [ ] **Expected**:
  - [ ] Panel transitions to **Game Results**
  - [ ] Displays large score box
  - [ ] Shows "Your Path" vs "Optimal Path" comparison
  - [ ] Shows efficiency percentage
  - [ ] **Console shows**: `[Game] Target reached! User hops: X`
  - [ ] Optimal path is fetched from backend and displayed

### Step 7: View Results & Stats
- [ ] Large score displayed (100 - deductions)
- [ ] Efficiency bar shows percentage filled
- [ ] Path comparison shows:
  - [ ] Your path (orange)
  - [ ] Optimal path (green)
- [ ] Stats box shows:
  - [ ] Games played: 1
  - [ ] Average score
  - [ ] Average efficiency

### Step 8: Next Game
- [ ] Click **Next Challenge 🎮** button
- [ ] **Expected**: Returns to artist selection (setup phase)
- [ ] Stats box updates to show: Games: 2 (if you've played before)

## 🐛 Debugging If Issues Occur

### Issue: Game doesn't auto-start after selecting 2nd artist
**Check**:
1. Console for errors (red text)
2. Are you clicking the autocomplete item or just typing?
3. Try clicking "Start Challenge" button manually
4. Refresh page and try again

**Console to Check**:
```
[Game] Artist selected: ..., Total selected: 2
[Game] Auto-starting game with: [...]
```

### Issue: No artist buttons appear in game
**Check**:
1. Are you seeing the hop counter and artist display?
2. Check console for:
   ```
   [Game] Found X relationships for [artist]
   [Game] Available next artists: ...
   ```
3. If found=0, artist may not have relationships in graph
4. Try different artist pair (e.g., Drake → Kendrick)

### Issue: Error fetching optimal path
**Check**:
1. Backend is running: `curl http://localhost:5001/api/dijkstra?from=dr-dre&to=kendrick-lamar`
2. Should return JSON with path and hops
3. Check console for exact error message
4. Refresh and try again

## ✅ Success Indicators

- [x] Game mode button toggles and shows panel
- [x] Artists can be selected from autocomplete
- [x] Game auto-starts after 2nd artist selection
- [x] Game play panel shows with clickable artist buttons
- [x] Clicking buttons increments hop counter
- [x] Path visualization updates as you play
- [x] Game auto-completes when target reached
- [x] Results panel shows score and comparison
- [x] Next Challenge button resets for new game
- [x] Console logs show logical flow with [Game] prefix

## 📊 Test Combinations to Try

| Artist 1 | Artist 2 | Expected Hops |
|----------|----------|---------------|
| Dr. Dre | Kendrick Lamar | 1-2 |
| Drake | Kendrick Lamar | 1-2 |
| Jay-Z | Beyoncé | 1 |
| Eminem | 50 Cent | 1 |
| Snoop Dogg | Tupac | 1-2 |

## 📱 Mobile Testing

If testing on mobile:
- [ ] Panel appears on right side (landscape)
- [ ] Panel appears as full-width overlay (portrait)
- [ ] Buttons are large enough to tap
- [ ] Game auto-starts after artist selection
- [ ] Scroll works if content is tall

## 🎯 Final Verification

All items below must be true for the fix to be considered successful:

- [ ] Game auto-starts within 1 second after selecting 2 artists
- [ ] Game play panel shows hop counter starting at 0
- [ ] Available artists are shown as clickable buttons
- [ ] Clicking artists increments hop counter
- [ ] Reaching target triggers results display
- [ ] Results show score, comparison, and efficiency
- [ ] Console shows [Game] logs (no red errors)
- [ ] Next Challenge button works correctly

---

## Expected Behavior Demo

**User Actions → Expected Results**

```
1. Click 🎮 Game Mode
   → Game setup panel appears

2. Type "eminem", click from dropdown
   → Eminem selected, Artist 2 search appears

3. Type "kendrick", click from dropdown
   → Game AUTOMATICALLY transitions to gameplay within 1 second
   → Hop counter shows 0
   → Eminem's collaborators appear as buttons

4. Click "Dr. Dre" button
   → Hop counter → 1
   → Path shows: Eminem → Dr. Dre
   → Dr. Dre's collaborators appear as buttons

5. Click "Kendrick Lamar" button
   → GAME COMPLETE
   → Results panel shows score
   → Shows: Your path (2 hops) vs Optimal path (1 hop)
   → Shows efficiency %

6. Click "Next Challenge 🎮"
   → Back to setup, ready for new game
```

This is the expected happy path. If you don't see this, check the debugging section above.
