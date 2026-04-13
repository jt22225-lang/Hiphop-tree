#!/usr/bin/env node
// fill-missing-data.js
// Fetches missing bio + wikidataId + wikipediaUrl for all artists in graph.json
// Uses Wikipedia API (no key required). Patches graph.json in place.
// Usage: node fill-missing-data.js

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const GRAPH_PATH = path.join(__dirname, 'graph.json');
const DELAY_MS   = 250; // polite rate-limit between requests

// ── Wikipedia name overrides ─────────────────────────────────────────────────
// Some artist names don't match their Wikipedia page title directly.
const WIKI_NAME_MAP = {
  'biggie':            'The Notorious B.I.G.',
  'tupac':             'Tupac Shakur',
  'puff-daddy':        'Sean Combs',
  'lil-kim':           "Lil' Kim",
  'wu-tang-clan':      'Wu-Tang Clan',
  'ti':                'T.I.',
  'andre-3000':        'André 3000',
  'tyler-the-creator': 'Tyler, the Creator',
  'frank-ocean':       'Frank Ocean',
  'birdman':           'Birdman (rapper)',
  'missy-elliott':     'Missy Elliott',
  'dj-premier':        'DJ Premier',
  'the-alchemist':     'The Alchemist (musician)',
  'j-dilla':           'J Dilla',
  'madlib':            'Madlib',
  'pharrell-williams': 'Pharrell Williams',
  'pete-rock':         'Pete Rock',
  'sounwave':          'Sounwave',
  'mf-doom':           'MF Doom',
  'asap-yams':         'ASAP Yams',
  'asap-rocky':        'ASAP Rocky',
  'ol-dirty-bastard':  "Ol' Dirty Bastard",
  'q-tip':             'Q-Tip (musician)',
  'da-brat':           'Da Brat',
  'capitol-steez':     'Capital STEEZ',
  'joey-badass':       'Joey Badass',
  'a-boogie-wit-da-hoodie': 'A Boogie wit da Hoodie',
  'young-ma':          'Young M.A',
  'top-dawg':          "Anthony Tiffith",
  'sir':               'SiR (musician)',
  'kal-banx':          'Kal Banx',
  'bas':               'Bas (rapper)',
  'earthgang':         'EarthGang',
  'ari-lennox':        'Ari Lennox',
  'cozz':              'Cozz (rapper)',
  'lute':              'Lute (rapper)',
  'omen':              'Omen (rapper)',
  'conway-the-machine':'Conway the Machine',
  'mach-hommy':        'Mach-Hommy',
  'armani-caesar':     'Armani Caesar',
  'rome-streetz':      'Rome Streetz',
  'stove-god-cooks':   'Stove God Cooks',
  'daringer':          'Daringer (producer)',
  'beat-butcha':       'Beat Butcha',
  'slim-williams':     'Ronald Williams (music executive)',
  'bg':                'B.G. (rapper)',
  'turk':              'Turk (rapper)',
  'mannie-fresh':      'Mannie Fresh',
  'silkk-the-shocker': 'Silkk the Shocker',
  'c-murder':          'C-Murder',
  'mia-x':             'Mia X',
  'la-reid':           'L.A. Reid',
  'ceeloo-green':      'CeeLo Green',
  'el-p':              'El-P',
  '2-chainz':          '2 Chainz',
  'rico-wade':         'Rico Wade',
  'dungeon-family':    'Dungeon Family',
  'dead-prez':         'Dead Prez',
  'nines':             'Nines (rapper)',
  'knucks':            'Knucks (rapper)',
  'problem':           'Problem (rapper)',
  'larry-june':        'Larry June',
  'reason':            'Reason (rapper)',
  'doechii':           'Doechii',
  'malice':            'Malice (rapper)',
  'protoje':           'Protoje',
  'blueface':          'Blueface (rapper)',
  'boldy-james':       'Boldy James',
  'westside-gunn':     'Westside Gunn',
  'dj-mustard':        'DJ Mustard',
  'dom-kennedy':       'Dom Kennedy',
  'statik-selektah':   'Statik Selektah',
  'nyck-caution':      'Nyck Caution',
  'kirk-knight':       'Kirk Knight',
  'cj-fly':            'CJ Fly',
  'beastie-boys':      'Beastie Boys',
  'public-enemy':      'Public Enemy (band)',
  'rick-rubin':        'Rick Rubin',
  'russell-simmons':   'Russell Simmons',
  'flatbush-zombies':  'Flatbush Zombies',
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'HipHopTree/1.0 (data-fill script) Node.js' }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Fetch bio + wikidataId for a Wikipedia title in one request
async function fetchWikiData(title) {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=extracts|pageprops&exintro=1&explaintext=1&redirects=1&format=json&pithumbsize=1`;

  const data = await get(url);
  const pages = data?.query?.pages;
  if (!pages) return null;

  const page = Object.values(pages)[0];
  if (page.missing !== undefined) return null;

  // Clean up the extract
  let bio = page.extract || null;
  if (bio) {
    bio = bio
      .replace(/==+[^=]+==/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\n\n[\s\S]*$/, '') // keep only first paragraph
      .trim();
    // Cap at ~400 chars
    if (bio.length > 400) {
      const cut = bio.lastIndexOf('. ', 400);
      bio = bio.slice(0, cut > 100 ? cut + 1 : 400).trim();
    }
  }

  const wikidataId  = page.pageprops?.wikibase_item || null;
  const wikipediaUrl = page.title
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`
    : null;

  return { bio, wikidataId, wikipediaUrl };
}

async function main() {
  const graph   = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  let updated   = 0;
  let notFound  = [];

  for (const artist of graph.artists) {
    const hasBio  = !!(artist.bio || artist.metadata?.bio);
    const hasWiki = !!(artist.metadata?.wikipediaUrl || artist.metadata?.wikidataId);

    if (hasBio && hasWiki) continue;

    // Determine Wikipedia search title
    const wikiTitle = WIKI_NAME_MAP[artist.id] || artist.name;
    process.stdout.write(`  [${artist.id}] "${wikiTitle}"... `);

    try {
      const result = await fetchWikiData(wikiTitle);

      if (!result) {
        console.log('❌ not found');
        notFound.push(artist.id);
        await sleep(DELAY_MS);
        continue;
      }

      // Ensure metadata object exists
      if (!artist.metadata) artist.metadata = {};

      if (!hasBio && result.bio) {
        artist.bio = result.bio;
      }
      if (!hasWiki) {
        if (result.wikidataId) artist.metadata.wikidataId   = result.wikidataId;
        if (result.wikipediaUrl) artist.metadata.wikipediaUrl = result.wikipediaUrl;
      }

      const got = [];
      if (!hasBio  && result.bio)         got.push('bio');
      if (!hasWiki && result.wikidataId)  got.push('wikidataId');
      if (!hasWiki && result.wikipediaUrl) got.push('wikiUrl');

      if (got.length > 0) {
        console.log(`✅ ${got.join(', ')}`);
        updated++;
      } else {
        console.log('⚠️  fetched but no new data');
      }
    } catch (err) {
      console.log(`❌ error: ${err.message}`);
      notFound.push(artist.id);
    }

    await sleep(DELAY_MS);
  }

  fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), 'utf8');
  console.log(`\n✅  Done. ${updated} artists updated.`);
  if (notFound.length > 0) {
    console.log(`⚠️  Not found on Wikipedia (${notFound.length}): ${notFound.join(', ')}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
