#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const graphPath = path.join(__dirname, 'graph.json');
let graphData = null;
const errors = [];
const warnings = [];

// 1. Parse JSON
try {
  const raw = fs.readFileSync(graphPath, 'utf-8');
  graphData = JSON.parse(raw);
  console.log('✓ JSON parsing successful');
} catch (err) {
  if (err instanceof SyntaxError) {
    const match = err.message.match(/position (\d+)/);
    const position = match ? parseInt(match[1]) : 'unknown';
    errors.push(`JSON Parse Error at position ${position}: ${err.message}`);
  } else {
    errors.push(`Failed to read graph.json: ${err.message}`);
  }
  printResults();
  process.exit(1);
}

// Validate structure
if (!graphData || typeof graphData !== 'object') {
  errors.push('graph.json root must be an object');
  printResults();
  process.exit(1);
}

if (!Array.isArray(graphData.artists)) {
  errors.push('graph.json.artists must be an array');
  printResults();
  process.exit(1);
}

if (!Array.isArray(graphData.relationships)) {
  errors.push('graph.json.relationships must be an array');
  printResults();
  process.exit(1);
}

if (!Array.isArray(graphData.collectives)) {
  errors.push('graph.json.collectives must be an array');
  printResults();
  process.exit(1);
}

// 2. Check for unique artist IDs
const artistIdSet = new Set();
const artistIdMap = new Map(); // For quick lookup
const duplicateArtistIds = [];

graphData.artists.forEach((artist, idx) => {
  if (!artist.id) {
    errors.push(`Artist at index ${idx} has no id`);
    return;
  }
  if (artistIdSet.has(artist.id)) {
    duplicateArtistIds.push(artist.id);
  } else {
    artistIdSet.add(artist.id);
    artistIdMap.set(artist.id, artist);
  }
});

if (duplicateArtistIds.length > 0) {
  errors.push(`Duplicate artist IDs found: ${duplicateArtistIds.join(', ')}`);
}
console.log(`✓ Artist IDs unique (${graphData.artists.length} artists)`);

// 3. Check for unique relationship IDs
const relationshipIdSet = new Set();
const duplicateRelationshipIds = [];

graphData.relationships.forEach((rel, idx) => {
  if (!rel.id) {
    errors.push(`Relationship at index ${idx} has no id`);
    return;
  }
  if (relationshipIdSet.has(rel.id)) {
    duplicateRelationshipIds.push(rel.id);
  } else {
    relationshipIdSet.add(rel.id);
  }
});

if (duplicateRelationshipIds.length > 0) {
  errors.push(`Duplicate relationship IDs found: ${duplicateRelationshipIds.join(', ')}`);
}
console.log(`✓ Relationship IDs unique (${graphData.relationships.length} relationships)`);

// 4. Validate relationships reference valid artists
const invalidRelationships = [];

graphData.relationships.forEach((rel) => {
  if (!rel.source) {
    errors.push(`Relationship ${rel.id} has no source`);
    return;
  }
  if (!rel.target) {
    errors.push(`Relationship ${rel.id} has no target`);
    return;
  }
  if (!artistIdSet.has(rel.source)) {
    invalidRelationships.push(`${rel.id}: source "${rel.source}" not found in artists`);
  }
  if (!artistIdSet.has(rel.target)) {
    invalidRelationships.push(`${rel.id}: target "${rel.target}" not found in artists`);
  }
});

if (invalidRelationships.length > 0) {
  errors.push(`Invalid relationship references:\n  ${invalidRelationships.join('\n  ')}`);
} else {
  console.log('✓ All relationship references valid');
}

// 5. Validate collectives
const invalidCollectiveMembers = [];

graphData.collectives.forEach((collective, idx) => {
  if (!collective.members || !Array.isArray(collective.members)) {
    if (collective.members !== undefined && collective.members !== null) {
      errors.push(`Collective at index ${idx} has invalid members field`);
    }
    return;
  }

  collective.members.forEach((memberId) => {
    if (!artistIdSet.has(memberId)) {
      invalidCollectiveMembers.push(`Collective "${collective.name}" (${idx}): member "${memberId}" not found in artists`);
    }
  });
});

if (invalidCollectiveMembers.length > 0) {
  errors.push(`Invalid collective members:\n  ${invalidCollectiveMembers.join('\n  ')}`);
} else {
  console.log('✓ All collective members valid');
}

// Warnings
// 5a. Artists with zero relationships
const artistRelationshipCounts = new Map();
graphData.artists.forEach(a => artistRelationshipCounts.set(a.id, 0));

graphData.relationships.forEach(rel => {
  artistRelationshipCounts.set(rel.source, (artistRelationshipCounts.get(rel.source) || 0) + 1);
  artistRelationshipCounts.set(rel.target, (artistRelationshipCounts.get(rel.target) || 0) + 1);
});

const artistsWithZeroRelationships = Array.from(artistRelationshipCounts.entries())
  .filter(([_, count]) => count === 0)
  .map(([id, _]) => id);

if (artistsWithZeroRelationships.length > 0) {
  warnings.push(`${artistsWithZeroRelationships.length} artists with zero relationships: ${artistsWithZeroRelationships.slice(0, 10).join(', ')}${artistsWithZeroRelationships.length > 10 ? '...' : ''}`);
}

// 5b. Artists with null wikipediaUrl
const artistsWithoutWiki = graphData.artists
  .filter(a => a.wikipediaUrl === null || a.wikipediaUrl === undefined)
  .map(a => a.id);

if (artistsWithoutWiki.length > 0) {
  warnings.push(`${artistsWithoutWiki.length} artists with no wikipediaUrl`);
}

function printResults() {
  console.log();
  if (warnings.length > 0) {
    console.log('⚠ Warnings:');
    warnings.forEach(w => console.log(`  ${w}`));
    console.log();
  }

  if (errors.length > 0) {
    console.log('✗ Errors:');
    errors.forEach(e => console.log(`  ${e}`));
    console.log();
    return false;
  }

  console.log('✓ Validation passed');
  return true;
}

const passed = printResults();
process.exit(passed ? 0 : 1);
