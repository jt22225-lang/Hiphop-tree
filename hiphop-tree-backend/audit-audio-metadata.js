const fs = require('fs');

const graph = JSON.parse(fs.readFileSync('./graph.json', 'utf8'));

// Track all audio_metadata entries
const audioEntries = [];

graph.relationships.forEach(rel => {
  if (rel.audio_metadata) {
    audioEntries.push({
      id: rel.id,
      source: rel.source,
      target: rel.target,
      track_name: rel.audio_metadata.track_name,
      itunes_track_id: rel.audio_metadata.itunes_track_id,
      isrc: rel.audio_metadata.isrc,
      preview_url_us: rel.audio_metadata.preview_url_us,
      preview_url_gb: rel.audio_metadata.preview_url_gb
    });
  }
});

console.log(`Total audio_metadata entries: ${audioEntries.length}\n`);
console.log('Audio Metadata Entries:');
console.log('='.repeat(80));

audioEntries.forEach((entry, idx) => {
  console.log(`\n[${idx + 1}] ${entry.id} (${entry.source} → ${entry.target})`);
  console.log(`    Track Name: "${entry.track_name}"`);
  console.log(`    iTunes ID: ${entry.itunes_track_id}`);
  console.log(`    ISRC: ${entry.isrc || 'N/A'}`);
  console.log(`    Preview: ${entry.preview_url_us ? 'US: Yes' : 'US: No'}${entry.preview_url_gb ? ', GB: Yes' : ''}`);
});

console.log('\n' + '='.repeat(80));
console.log(`Total: ${audioEntries.length} entries`);
console.log('\nKnown Issues:');
console.log('- rel_005 (Dr. Dre → 50 Cent): shows "If I Can\'t" but plays "Still D.R.E."');
console.log('- rel_006 (Eminem → 50 Cent): shows "Patiently Waiting (feat. Eminem)" but plays "P.I.M.P."');
