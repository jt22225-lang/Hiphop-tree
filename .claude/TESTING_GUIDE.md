# Shortest Path Game - Testing Guide

## Quick Start

### Prerequisites
- Backend running on port 5001
- Frontend running on port 3000
- Both have `npm install` completed

### Step 1: Start the Backend
```bash
cd hiphop-tree-backend
npm run dev
# Should output: "🎤 HipHopTree backend running on http://localhost:5001"
```

### Step 2: Verify Dijkstra Endpoint
```bash
curl "http://localhost:5001/api/dijkstra?from=kendrick-lamar&to=jay-z&weighted=false" | jq .hops
# Expected: 2
```

### Step 3: Start the Frontend
```bash
cd hiphop-tree-frontend
npm start
# Opens http://localhost:3000 in browser
```

### Step 4: Test Game Mode

#### Basic Flow:
1. **Click 🎮 Game Mode button** in the header (top right)
   - Should see: "🎮 Find the Connection" panel replace the sidebar
   - The graph remains interactive in the background

2. **Select Artist 1** from the autocomplete dropdown
   - Example: "Kendrick Lamar"
   - Click to select

3. **Select Artist 2** from the autocomplete dropdown
   - Example: "Drake"
   - Click to select
   - You should see "START CHALLENGE" button become enabled (orange)

4. **Click START CHALLENGE**
   - Should see: Game play panel with hop counter at 0
   - Available next artists displayed as buttons

5. **Click through connections**
   - Click a next artist button
   - Counter increments to 1
   - New next artists appear based on current selection
   - Continue until you reach the target artist

6. **View Results**
   - When target reached, automatically fetches optimal path
   - Shows score, comparison, and efficiency percentage
   - Displays cumulative stats (games played, avg score)

7. **Next Challenge or Exit**
   - Click "Next Challenge" to play again
   - Click "Exit Game" to return to normal graph browsing

## Expected Test Cases

### Test Case 1: Basic Game Flow
**Setup**: Kendrick Lamar → Jay-Z
**Expected Result**: 
- Optimal path: 2 hops (K. Lamar → J. Cole → Jay-Z)
- If user takes 2 hops: 100 points, 100% efficiency ✅

### Test Case 2: Suboptimal Path
**Setup**: Same as Test 1, but user takes 3+ hops
**Expected Result**:
- Optimal: 2 hops
- User: 3 hops
- Score: 100 - (3-2)*25 = 75 points
- Efficiency: 67%

### Test Case 3: Significant Detour
**Setup**: Any pair, user takes 5+ hops vs optimal 2-3
**Expected Result**:
- Score drops to 0 (if >4 hops extra)
- Efficiency shows <50%

### Test Case 4: Artist Selection Edge Cases
**Setup**: Try selecting same artist twice
**Expected Result**: 
- Remove button appears on first artist
- Can deselect and reselect different artists

### Test Case 5: Stats Persistence
**Procedure**:
1. Play a game, note your score
2. Refresh the browser (F5)
3. Click Game Mode again
4. Stats box should show previous game(s)

## Performance Checks

- ⚡ Dijkstra endpoint response: <50ms
- 🎨 Game panel slides in smoothly: <300ms
- 🔍 Artist search filters instantly
- 📊 Results display appears immediately after reaching target

## Browser Console

Check for any errors:
1. Open Developer Tools (F12)
2. Click "Console" tab
3. Play through game
4. Should see NO red error messages

### Expected Console Output
```javascript
// When game starts
// (no console output — silent operation)

// When game completes
// (no errors)
```

## Mobile/Responsive Testing

**Viewport Sizes**:
- Desktop: 1280×800 ✓
- Tablet: 768×1024 ✓
- Mobile: 375×812 ✓ (game panel should stack appropriately)

## Common Issues & Fixes

### Issue: "Cannot find module './GameModeManager'"
**Fix**: Ensure file exists at `src/GameModeManager.js`
```bash
ls -la hiphop-tree-frontend/src/Game*.js
```

### Issue: CSS not loading (unstyled buttons)
**Fix**: Verify CSS imports
```bash
grep "import.*GameModeManager.css" hiphop-tree-frontend/src/GameModeManager.js
# Should show: import './GameModeManager.css';
```

### Issue: Dijkstra returns null path
**Possible causes**:
- Artist IDs are incorrect (use kebab-case: "kendrick-lamar")
- No path exists between artists (disconnected graph)
- Backend not running

**Fix**: 
```bash
# Check artist IDs
curl "http://localhost:5001/api/search?q=kendrick" | jq '.[0].id'

# Verify Dijkstra works
curl "http://localhost:5001/api/dijkstra?from=kendrick-lamar&to=j-cole" | jq .
```

### Issue: Autocomplete dropdown not appearing
**Fix**: Make sure input has focus and there's a matching artist name

## Verified Test Results

✅ Backend: Dijkstra endpoint working (tested Kendrick→Jay-Z = 2 hops)
✅ Frontend: All components syntax-verified
✅ Styling: CSS files linked and loaded
✅ State: Game mode integration verified in App.js
✅ Imports/Exports: All correct

## Next Phase (If Needed)

After basic testing, optional enhancements:
- Add visual path highlighting on graph
- Implement weighted paths using relationship strength
- Add difficulty levels
- Add timed challenge mode
- Create leaderboard
