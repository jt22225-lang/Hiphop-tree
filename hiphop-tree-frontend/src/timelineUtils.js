/**
 * timelineUtils.js
 *
 * Dynamically generates timeline markers and era information
 * from the actual graph data, removing all hardcoded values.
 */

// Map era strings like "90s" → {decade: 1990, label: "1990s"}
function parseEraString(era) {
  const match = era.match(/(\d{2,4})s/);
  if (!match) return null;

  const year = match[1].length === 2
    ? parseInt(match[1]) * 100
    : parseInt(match[1]);

  return { decade: year, label: `${year}s` };
}

/**
 * Extract all unique eras from artists in the graph
 * Returns: { "90s": true, "2000s": true, "2010s": true, ... }
 */
export function extractAllEras(graphData) {
  if (!graphData?.artists) return {};

  const eras = {};
  graphData.artists.forEach(artist => {
    if (artist.era) {
      eras[artist.era] = true;
    }
  });
  return eras;
}

/**
 * Get all unique years from relationships + artist eras
 * Returns sorted array of years: [1990, 1992, 1996, ...]
 */
export function extractAllYears(graphData) {
  const years = new Set();

  if (graphData?.relationships) {
    graphData.relationships.forEach(rel => {
      if (rel.year) {
        years.add(rel.year);
      }
    });
  }

  // Add decade-start years from artist eras
  if (graphData?.artists) {
    graphData.artists.forEach(artist => {
      if (artist.era) {
        const parsed = parseEraString(artist.era);
        if (parsed) {
          years.add(parsed.decade);
        }
      }
    });
  }

  return Array.from(years).sort((a, b) => a - b);
}

/**
 * Generate era markers for the timeline
 * Creates intelligent markers at decade boundaries + major events
 *
 * Returns: [
 *   { year: 1980, label: "1980s", emoji: "🎤" },
 *   { year: 1990, label: "1990s", emoji: "🐉" },
 *   ...
 * ]
 */
export function generateEraMarkers(graphData) {
  const allYears = extractAllYears(graphData);

  if (allYears.length === 0) {
    return [{ year: new Date().getFullYear(), label: "Now", emoji: "⚡" }];
  }

  // Emoji rotation for visual variety
  const emojiPool = ["🎤", "🐉", "👑", "📡", "🍩", "💰", "🌅", "🔮", "⚡"];
  let emojiIndex = 0;

  // Create markers at decade boundaries that have artists/events
  const markers = [];
  const decadeBoundaries = new Set();

  allYears.forEach(year => {
    const decade = Math.floor(year / 10) * 10;
    decadeBoundaries.add(decade);
  });

  // Sort and create markers
  Array.from(decadeBoundaries)
    .sort((a, b) => a - b)
    .forEach(decade => {
      const label = `${decade}s`;
      const emoji = emojiPool[emojiIndex % emojiPool.length];
      markers.push({ year: decade, label, emoji });
      emojiIndex++;
    });

  // Always add the final year as "Now"
  const maxYear = Math.max(...allYears);
  if (!markers.some(m => m.year === maxYear) && markers.length > 0) {
    markers.push({ year: maxYear, label: "Now", emoji: "⚡" });
  }

  return markers;
}

/**
 * Get the year range for the slider
 * Returns: { minYear: 1980, maxYear: 2024 }
 */
export function getYearRange(graphData) {
  const allYears = extractAllYears(graphData);

  if (allYears.length === 0) {
    const now = new Date().getFullYear();
    return { minYear: now - 10, maxYear: now };
  }

  const minYear = Math.floor(Math.min(...allYears) / 10) * 10;
  const maxYear = Math.ceil(Math.max(...allYears) / 10) * 10;

  return { minYear, maxYear };
}

/**
 * Sort eras by decade for consistent ordering
 * Returns: ["1980s", "1990s", "2000s", "2010s", "2020s"]
 */
export function sortErasChronologically(eras) {
  const eraArray = Object.keys(eras);
  return eraArray.sort((a, b) => {
    const parseA = parseEraString(a);
    const parseB = parseEraString(b);

    if (!parseA || !parseB) return 0;
    return parseA.decade - parseB.decade;
  });
}

/**
 * Get CSS class name for an era
 * "90s" → "era-90s" or "era-1990s"
 */
export function getEraCssClass(era) {
  return `era-${era.toLowerCase()}`;
}

/**
 * Count artists per era
 * Returns: { "90s": 15, "2000s": 23, ... }
 */
export function countArtistsPerEra(graphData) {
  const counts = {};

  if (graphData?.artists) {
    graphData.artists.forEach(artist => {
      if (artist.era) {
        counts[artist.era] = (counts[artist.era] || 0) + 1;
      }
    });
  }

  return counts;
}
