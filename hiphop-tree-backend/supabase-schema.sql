-- ═══════════════════════════════════════════════════════════════════
-- HipHopTree  ·  Supabase / PostgreSQL Schema
-- Producer-Centric Design — Legends anchor the universe
-- ═══════════════════════════════════════════════════════════════════
--
-- Core idea: producers are first-class citizens, not just edge labels.
-- Think of it like a city map: Producers are the subway lines (they
-- connect everyone), Artists are the stations, and Eras are the
-- boroughs those stations belong to.
--
-- Many-to-many handled via a dedicated junction table (producer_eras)
-- so Sounwave can belong to "TDE early years" AND "Post-TPAB era"
-- without duplicating rows or embedding arrays.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. Eras ────────────────────────────────────────────────────────
-- Named time-periods with an optional dominant region and vibe tag.
CREATE TABLE IF NOT EXISTS eras (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,          -- e.g. 'tde-early', '90s-boom-bap'
  name        TEXT NOT NULL,                 -- e.g. 'TDE Early Years (2009–2012)'
  decade      TEXT,                          -- '80s' | '90s' | '2000s' | '2010s' | '2020s'
  region      TEXT,                          -- 'East Coast' | 'West Coast' | 'South' | 'Global'
  description TEXT,
  color_hex   TEXT DEFAULT '#6b7280',        -- used for era-tinted UI elements
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed data for the Legend era periods
INSERT INTO eras (slug, name, decade, region, color_hex, description) VALUES
  ('boom-bap-golden-age',   '90s Boom-Bap Golden Age (1988–1998)',     '90s',   'East Coast', '#e11d48', 'The era DJ Premier and Pete Rock built — hard drums, jazz loops, no hooks needed.'),
  ('neptunes-pop-rap',       'Neptunes Pop-Rap Era (1999–2007)',         '2000s', 'East Coast', '#22d3ee', 'Pharrell turned skeletal hi-hat patterns into Billboard #1s. Minimal but massive.'),
  ('madlib-dilla-abstract',  'Abstract / Lo-Fi Era (2001–2006)',         '2000s', 'National',   '#a855f7', 'Dilla and Madlib rewired what beats could sound like — off-grid, chopped, human.'),
  ('ye-soul-flip',           'Kanye Soul-Flip Era (2003–2007)',          '2000s', 'Chicago',    '#f97316', 'Chipmunk souls and soul-sample chops changed who could be a producer overnight.'),
  ('tde-early',              'TDE Early Years (2009–2012)',              '2010s', 'West Coast', '#4ade80', 'Sounwave, Willie B, and Lance building the West Coast renaissance from Compton.'),
  ('kendrick-full-arc',      'Kendrick / Sounwave Full Arc (2012–2024)', '2010s', 'West Coast', '#06b6d4', 'Four albums, each a completely different sonic world — the most ambitious run in rap history.'),
  ('alc-modern-boom-bap',    'Alchemist Modern Boom-Bap (2010–present)', '2010s', 'East Coast', '#f59e0b', 'Alchemist revived grimy sample-based rap for a new generation without irony.'),
  ('doom-underground',       'DOOM Underground Canon (1999–2012)',       '2000s', 'East Coast', '#6366f1', 'DOOM's masked mythology created a parallel hip-hop universe that still runs.')
ON CONFLICT (slug) DO NOTHING;


-- ── 2. Artists ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS artists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,         -- matches graph.json id, e.g. 'dj-premier'
  name            TEXT NOT NULL,
  role            TEXT DEFAULT 'artist',        -- 'artist' | 'producer' | 'both'
  is_legend       BOOLEAN DEFAULT FALSE,        -- Verified Architect status
  era_slug        TEXT,                         -- primary era (FK-lite; no constraint for flexibility)
  region          TEXT,
  label           TEXT,
  wikidata_id     TEXT,                         -- e.g. 'Q456097'
  musicbrainz_id  UUID,
  metadata        JSONB DEFAULT '{}'::JSONB,   -- personalNote, culturalImpact, etc.
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Full-text search index on name
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists USING GIN (to_tsvector('english', name));

-- Partial index: quickly fetch all Verified Architects
CREATE INDEX IF NOT EXISTS idx_artists_legend ON artists (is_legend) WHERE is_legend = TRUE;


-- ── 3. Producer ↔ Era  (many-to-many) ──────────────────────────────
-- This is the answer to "how does Sounwave span multiple eras?"
-- Each row says: this producer was architecturally active in this era,
-- possibly in a specific capacity (primary, collaborator, influence).
CREATE TABLE IF NOT EXISTS producer_eras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_slug   TEXT NOT NULL REFERENCES artists(slug) ON DELETE CASCADE,
  era_slug        TEXT NOT NULL REFERENCES eras(slug)    ON DELETE CASCADE,
  capacity        TEXT DEFAULT 'primary',     -- 'primary' | 'collaborator' | 'influence'
  notes           TEXT,                       -- e.g. 'Transitioned from G-funk to West Coast jazz'
  created_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE (producer_slug, era_slug)            -- no duplicate rows per producer-era pair
);

-- Example: Sounwave spanning two distinct TDE eras
-- INSERT INTO producer_eras (producer_slug, era_slug, capacity, notes) VALUES
--   ('sounwave', 'tde-early',         'primary',      'Built the sonic DNA of GKMC and early TDE mixtapes'),
--   ('sounwave', 'kendrick-full-arc', 'primary',      'Lead architect on TPAB, DAMN., and Mr. Morale');

-- Example: DJ Premier spanning multiple decades
-- INSERT INTO producer_eras (producer_slug, era_slug, capacity, notes) VALUES
--   ('dj-premier', 'boom-bap-golden-age', 'primary',   'Defined the standard with Gang Starr and Nas collabs'),
--   ('dj-premier', 'alc-modern-boom-bap', 'influence', 'Template that Alchemist inherited and extended');


-- ── 4. Relationships ───────────────────────────────────────────────
-- Mirrors graph.json relationships but persisted in Postgres.
-- The strength column powers D3/Cytoscape edge width directly.
CREATE TABLE IF NOT EXISTS relationships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug     TEXT NOT NULL REFERENCES artists(slug) ON DELETE CASCADE,
  target_slug     TEXT NOT NULL REFERENCES artists(slug) ON DELETE CASCADE,
  type            TEXT NOT NULL,           -- 'collaborative' | 'mentorship' | 'collective' | 'familial'
  subtype         TEXT,                    -- 'produced_by' | 'signed_to' | 'member_of' etc.
  strength        NUMERIC(3,2) DEFAULT 0.7 CHECK (strength BETWEEN 0 AND 1),
  label           TEXT,                    -- human-readable event: "Illmatic (1994)"
  verified        BOOLEAN DEFAULT FALSE,
  source_url      TEXT,                    -- Wikidata/MusicBrainz URI that backs this claim
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships (source_slug);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships (target_slug);

-- ── 5. Cache table (mirrors cache.js for Supabase deployments) ─────
CREATE TABLE IF NOT EXISTS artist_cache (
  key         TEXT PRIMARY KEY,
  name        TEXT,
  data        JSONB DEFAULT '{}'::JSONB,
  fetched_at  TIMESTAMPTZ DEFAULT now(),
  stale_at    TIMESTAMPTZ GENERATED ALWAYS AS (fetched_at + INTERVAL '7 days') STORED
);

-- ── 6. New columns for temporal mentorship & Deep Cut system ──
--
-- "Evolution of a Legend": connection_year tracks WHEN a link
-- was formed, enabling the History Slider to show how the tree
-- grew over time. Think of it like a tree-ring — each year's
-- connections form a new layer of growth.
--
-- "Deep Cut": impact_score + is_deep_cut let us surface obscure
-- but high-impact artists. A low-fame node connected to a
-- Verified Architect is the definition of a "hidden gem" — the
-- producer who shows up on one legendary debut and disappears.
ALTER TABLE relationships
  ADD COLUMN IF NOT EXISTS connection_year INT
    CHECK (connection_year BETWEEN 1970 AND 2030);

-- Partial index for fast timeline queries:
-- "Give me all connections before 1998" is a common slider query.
CREATE INDEX IF NOT EXISTS idx_rel_year
  ON relationships (connection_year)
  WHERE connection_year IS NOT NULL;

-- popularity_score: 1–10 scale, sourced from Wikidata/Spotify data.
-- Lower scores = more obscure. Default 5 = average visibility.
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS popularity_score NUMERIC(3,1) DEFAULT 5.0
    CHECK (popularity_score BETWEEN 0 AND 10);

-- impact_score: separate from popularity — a niche producer can
-- have low popularity but high impact (Dilla, Alchemist early career).
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS impact_score NUMERIC(3,1) DEFAULT 5.0
    CHECK (impact_score BETWEEN 0 AND 10);

-- is_deep_cut: computed flag. TRUE when popularity_score < 4.0
-- AND connected to at least one is_legend=TRUE artist.
-- Can be set manually or via the flagDeepCuts() function below.
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS is_deep_cut BOOLEAN DEFAULT FALSE;

-- Partial index: quickly fetch all Deep Cuts for badge rendering.
CREATE INDEX IF NOT EXISTS idx_artists_deep_cut
  ON artists (is_deep_cut)
  WHERE is_deep_cut = TRUE;

-- Deep Cut auto-flag function:
-- Run this periodically or after bulk imports. Flags any non-legend
-- artist with popularity < 4 who has a direct connection to a Legend.
--
-- Analogy: like a record store employee who silently recommends
-- "the B-side that influenced everything" — the algorithm does
-- the crate-digging for you.
CREATE OR REPLACE FUNCTION flag_deep_cuts()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE artists a
  SET    is_deep_cut = TRUE
  WHERE  a.is_legend   = FALSE
    AND  a.popularity_score < 4.0
    AND  EXISTS (
           SELECT 1
           FROM   relationships r
           JOIN   artists legend ON (
                    (r.source_slug = a.slug      AND r.target_slug = legend.slug) OR
                    (r.target_slug = a.slug      AND r.source_slug = legend.slug)
                  )
           WHERE  legend.is_legend = TRUE
         );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ── 7. Helpful views ───────────────────────────────────────────────

-- All Verified Architects with their era spans
CREATE OR REPLACE VIEW v_legend_era_map AS
SELECT
  a.slug,
  a.name,
  a.wikidata_id,
  ARRAY_AGG(pe.era_slug ORDER BY e.decade) AS era_slugs,
  ARRAY_AGG(e.name      ORDER BY e.decade) AS era_names,
  a.metadata->>'culturalImpact' AS cultural_impact
FROM artists a
JOIN producer_eras pe ON pe.producer_slug = a.slug
JOIN eras e           ON e.slug           = pe.era_slug
WHERE a.is_legend = TRUE
GROUP BY a.slug, a.name, a.wikidata_id, a.metadata;

-- Artists each legend producer has credited connections to
CREATE OR REPLACE VIEW v_legend_connections AS
SELECT
  src.name  AS legend_name,
  tgt.name  AS connected_artist,
  r.type,
  r.subtype,
  r.label,
  r.strength
FROM relationships r
JOIN artists src ON src.slug = r.source_slug
JOIN artists tgt ON tgt.slug = r.target_slug
WHERE src.is_legend = TRUE
ORDER BY src.name, r.strength DESC;
