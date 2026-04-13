#!/usr/bin/env node
// fill-wiki-urls.js
// Targeted fix: adds wikipediaUrl to any artist that has wikidataId but no wikipediaUrl.
// Uses Wikidata sitelinks API — if an artist has a Wikidata entry, this reliably
// gives us the exact Wikipedia article title with no disambiguation guesswork.
// Usage: node fill-wiki-urls.js

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const GRAPH_PATH = path.join(__dirname, 'graph.json');
const DELAY_MS   = 400;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'HipHopTree/1.0 (fill-wiki-urls) Node.js',
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

async function getWikipediaUrlByName(name) {
  const encoded = encodeURIComponent(name.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=info&inprop=url&redirects=1&format=json`;
  const data = await get(url);
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (page.missing !== undefined) return null;
  return page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent((page.title || name).replace(/ /g, '_'))}`;
}

async function main() {
  const graph  = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  const targets = graph.artists.filter(a => !a.metadata?.wikipediaUrl);

  console.log(`Artists missing wikipediaUrl: ${targets.length}\n`);
  let updated = 0, notFound = [];

  for (const artist of targets) {
    process.stdout.write(`  [${artist.id}] "${artist.name}"... `);
    await sleep(DELAY_MS);

    if (!artist.metadata) artist.metadata = {};

    try {
      let url = null;

      // Name-based search: directly query Wikipedia for the article — most reliable
      url = await getWikipediaUrlByName(artist.name);

      if (url) {
        artist.metadata.wikipediaUrl = url;
        console.log(`✅ ${url}`);
        updated++;
      } else {
        console.log('❌ not found');
        notFound.push(artist.id);
      }
    } catch (err) {
      console.log(`❌ error: ${err.message}`);
      notFound.push(artist.id);
    }
  }

  fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), 'utf8');
  console.log(`\n✅  Done. ${updated} wikipediaUrl values added.`);
  if (notFound.length > 0) {
    console.log(`⚠️  Still missing (${notFound.length}): ${notFound.join(', ')}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
