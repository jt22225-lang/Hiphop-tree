#!/usr/bin/env node
// Retry script for the 31 artists that errored or weren't found
const fs    = require('fs');
const path  = require('path');
const https = require('https');

const GRAPH_PATH = path.join(__dirname, 'graph.json');
const DELAY_MS   = 600; // longer delay to avoid rate limiting

// Corrected titles for the failed batch
const RETRY_MAP = {
  'blueface':          'Blueface',
  'malice':            'No Malice',
  'knucks':            'Knucks',
  'jid':               'J.I.D',
  'sir':               'SiR',
  'reason':            'Reason (rapper)',
  'kal-banx':          'Kal Banx',
  'bas':               'Bas (rapper)',
  'ari-lennox':        'Ari Lennox',
  'cozz':              'Cozz',
  'lute':              'Lute',
  'conway-the-machine':'Conway the Machine',
  'mach-hommy':        'Mach-Hommy',
  'rome-streetz':      'Rome Streetz',
  'daringer':          'Daringer',
  'lloyd-banks':       'Lloyd Banks',
  'young-buck':        'Young Buck',
  'rick-rubin':        'Rick Rubin',
  'public-enemy':      'Public Enemy',
  'cj-fly':            'CJ Fly',
  'nyck-caution':      'Nyck Caution',
  'slim-williams':     'Slim Williams',
  'bg':                'B.G.',
  'mannie-fresh':      'Mannie Fresh',
  'master-p':          'Master P',
  'c-murder':          'C-Murder',
  'mia-x':             'Mia X',
  'babyface':          'Babyface (musician)',
  'ceeloo-green':      'CeeLo Green',
  'el-p':              'El-P',
  'rico-wade':         'Rico Wade',
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'HipHopTree/1.0 (data-fill retry script) Node.js',
        'Accept': 'application/json',
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Parse error (status ${res.statusCode})`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchWikiData(title) {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=extracts|pageprops&exintro=1&explaintext=1&redirects=1&format=json`;

  const data = await get(url);
  const pages = data?.query?.pages;
  if (!pages) return null;

  const page = Object.values(pages)[0];
  if (page.missing !== undefined) return null;

  let bio = page.extract || null;
  if (bio) {
    bio = bio
      .replace(/==+[^=]+==/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\n\n[\s\S]*$/, '')
      .trim();
    if (bio.length > 400) {
      const cut = bio.lastIndexOf('. ', 400);
      bio = bio.slice(0, cut > 100 ? cut + 1 : 400).trim();
    }
  }

  const wikidataId   = page.pageprops?.wikibase_item || null;
  const wikipediaUrl = page.title
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`
    : null;

  return { bio, wikidataId, wikipediaUrl };
}

async function main() {
  const graph  = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  let updated  = 0;
  let stillMissing = [];

  for (const [artistId, wikiTitle] of Object.entries(RETRY_MAP)) {
    const artist = graph.artists.find(a => a.id === artistId);
    if (!artist) { console.log(`  [${artistId}] ⚠️ not in graph`); continue; }

    const hasBio  = !!(artist.bio || artist.metadata?.bio);
    const hasWiki = !!(artist.metadata?.wikipediaUrl || artist.metadata?.wikidataId);

    if (hasBio && hasWiki) {
      console.log(`  [${artistId}] ✅ already complete, skipping`);
      continue;
    }

    process.stdout.write(`  [${artistId}] "${wikiTitle}"... `);
    await sleep(DELAY_MS);

    try {
      const result = await fetchWikiData(wikiTitle);

      if (!result) {
        console.log('❌ not found on Wikipedia');
        stillMissing.push(artistId);
        continue;
      }

      if (!artist.metadata) artist.metadata = {};

      const got = [];
      if (!hasBio && result.bio) {
        artist.bio = result.bio;
        got.push('bio');
      }
      if (!hasWiki) {
        if (result.wikidataId)  { artist.metadata.wikidataId  = result.wikidataId;  got.push('wikidataId'); }
        if (result.wikipediaUrl){ artist.metadata.wikipediaUrl = result.wikipediaUrl; got.push('wikiUrl'); }
      }

      if (got.length > 0) {
        console.log(`✅ ${got.join(', ')}`);
        updated++;
      } else {
        console.log('⚠️  fetched but nothing new to add');
      }
    } catch (err) {
      console.log(`❌ error: ${err.message}`);
      stillMissing.push(artistId);
    }
  }

  fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), 'utf8');
  console.log(`\n✅  Done. ${updated} more artists updated.`);
  if (stillMissing.length > 0) {
    console.log(`⚠️  Still missing (${stillMissing.length}): ${stillMissing.join(', ')}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
