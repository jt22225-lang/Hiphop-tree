const fs = require('fs');

const graph = JSON.parse(fs.readFileSync('./graph.json', 'utf8'));

// Known corrections based on user feedback
const corrections = {
  'rel_005': {
    oldName: 'If I Can\'t',
    newName: 'Still D.R.E.',
    reason: 'Dr. Dre song, not 50 Cent - user clarified If I Can\'t is 50 Cent\'s song'
  },
  'rel_006': {
    oldName: 'Patiently Waiting (feat. Eminem)',
    newName: 'P.I.M.P.',
    reason: 'Track name should match what actually plays from the preview URL'
  }
};

let updated = 0;

graph.relationships.forEach(rel => {
  if (corrections[rel.id] && rel.audio_metadata) {
    const correction = corrections[rel.id];
    if (rel.audio_metadata.track_name === correction.oldName) {
      console.log(`✓ Fixing ${rel.id} (${rel.source} → ${rel.target})`);
      console.log(`  "${correction.oldName}" → "${correction.newName}"`);
      console.log(`  Reason: ${correction.reason}`);
      rel.audio_metadata.track_name = correction.newName;
      updated++;
    }
  }
});

if (updated > 0) {
  fs.writeFileSync('./graph.json', JSON.stringify(graph, null, 2));
  console.log(`\n✓ Updated ${updated} entries in graph.json`);
} else {
  console.log('No corrections needed');
}
