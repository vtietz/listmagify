-- Recommendation System Schema for SQLite
-- Enable WAL mode for better concurrency
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

--------------------------------------------------------------------------------
-- CORE TABLES
--------------------------------------------------------------------------------

-- Track metadata cache
CREATE TABLE IF NOT EXISTS tracks (
  track_id TEXT PRIMARY KEY,
  uri TEXT NOT NULL,
  name TEXT NOT NULL,
  artist TEXT, -- Combined artist names
  artist_ids TEXT, -- JSON array of artist IDs
  album_id TEXT,
  genres TEXT, -- JSON array of genres (from artist data)
  popularity INTEGER, -- 0-100
  duration_ms INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);

-- Sequential adjacency edges (weighted directional: A -> B means B followed A)
CREATE TABLE IF NOT EXISTS track_edges_seq (
  from_track_id TEXT NOT NULL,
  to_track_id TEXT NOT NULL,
  weight_seq REAL NOT NULL DEFAULT 1.0,
  last_seen_ts INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (from_track_id, to_track_id)
);
CREATE INDEX IF NOT EXISTS idx_track_edges_seq_from ON track_edges_seq(from_track_id);

-- Co-occurrence edges (undirected: tracks appearing in same playlists)
-- Convention: track_id_a < track_id_b to avoid duplicates
CREATE TABLE IF NOT EXISTS track_cooccurrence (
  track_id_a TEXT NOT NULL,
  track_id_b TEXT NOT NULL,
  weight_co REAL NOT NULL DEFAULT 1.0,
  last_seen_ts INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (track_id_a, track_id_b)
);
CREATE INDEX IF NOT EXISTS idx_track_cooccurrence_a ON track_cooccurrence(track_id_a);
CREATE INDEX IF NOT EXISTS idx_track_cooccurrence_b ON track_cooccurrence(track_id_b);

--------------------------------------------------------------------------------
-- USER DATA TABLES
--------------------------------------------------------------------------------

-- Dismissed recommendations (per-playlist context)
CREATE TABLE IF NOT EXISTS dismissed_recommendations (
  context_id TEXT NOT NULL, -- playlist_id or 'global'
  track_id TEXT NOT NULL,
  dismissed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (context_id, track_id)
);
CREATE INDEX IF NOT EXISTS idx_dismissed_context ON dismissed_recommendations(context_id);

--------------------------------------------------------------------------------
-- VIEWS (for common queries)
--------------------------------------------------------------------------------

-- View: All edges from a track (union of seq and co-occurrence)
CREATE VIEW IF NOT EXISTS v_all_track_edges AS
SELECT 
  from_track_id,
  to_track_id,
  weight_seq as weight,
  'seq' as edge_type,
  last_seen_ts
FROM track_edges_seq
UNION ALL
SELECT 
  track_id_a as from_track_id,
  track_id_b as to_track_id,
  weight_co as weight,
  'cooccur' as edge_type,
  last_seen_ts
FROM track_cooccurrence
UNION ALL
SELECT 
  track_id_b as from_track_id,
  track_id_a as to_track_id,
  weight_co as weight,
  'cooccur' as edge_type,
  last_seen_ts
FROM track_cooccurrence;
