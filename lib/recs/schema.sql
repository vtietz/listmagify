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
  artist_ids TEXT, -- JSON array of artist IDs
  album_id TEXT,
  genres TEXT, -- JSON array of genres (from artist data)
  popularity INTEGER, -- 0-100
  duration_ms INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);

-- Playlist track snapshots (captures playlist state over time)
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  snapshot_ts INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (playlist_id, track_id, snapshot_ts)
);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_snapshot ON playlist_tracks(playlist_id, snapshot_ts);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);

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

-- Optional: Audio feature vectors (for content-based recommendations)
CREATE TABLE IF NOT EXISTS track_features (
  track_id TEXT PRIMARY KEY,
  vector TEXT NOT NULL, -- JSON array of floats
  dim INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'spotify', -- 'spotify' or 'computed'
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

--------------------------------------------------------------------------------
-- CATALOG TABLES
--------------------------------------------------------------------------------

-- Artist top tracks (per market)
CREATE TABLE IF NOT EXISTS artist_top_tracks (
  artist_id TEXT NOT NULL,
  market TEXT NOT NULL,
  track_id TEXT NOT NULL,
  rank INTEGER NOT NULL, -- 1-10 typically
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (artist_id, market, track_id)
);
CREATE INDEX IF NOT EXISTS idx_artist_top_tracks_artist_market ON artist_top_tracks(artist_id, market);

-- Album tracks with positions
CREATE TABLE IF NOT EXISTS album_tracks (
  album_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL, -- 0-indexed disc + track position
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (album_id, track_id)
);
CREATE INDEX IF NOT EXISTS idx_album_tracks_album ON album_tracks(album_id);

-- Track popularity cache
CREATE TABLE IF NOT EXISTS track_popularity (
  track_id TEXT PRIMARY KEY,
  popularity INTEGER NOT NULL, -- 0-100
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Related artists (optional, can increase data volume significantly)
CREATE TABLE IF NOT EXISTS related_artists (
  artist_id TEXT NOT NULL,
  related_artist_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0, -- Can encode Spotify's ordering
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (artist_id, related_artist_id)
);
CREATE INDEX IF NOT EXISTS idx_related_artists_artist ON related_artists(artist_id);

-- Derived catalog edges (precomputed from catalog data)
-- Types: 'artist_top' | 'album_adj' | 'related_artist_top'
CREATE TABLE IF NOT EXISTS track_catalog_edges (
  edge_type TEXT NOT NULL,
  from_track_id TEXT NOT NULL,
  to_track_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  last_seen_ts INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (edge_type, from_track_id, to_track_id)
);
CREATE INDEX IF NOT EXISTS idx_track_catalog_edges_type_from ON track_catalog_edges(edge_type, from_track_id);

--------------------------------------------------------------------------------
-- MAINTENANCE/METADATA TABLES
--------------------------------------------------------------------------------

-- System metadata for tracking cron jobs and maintenance
CREATE TABLE IF NOT EXISTS recs_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Dismissed recommendations (per-session or persistent)
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

-- View: All edges from a track (union of seq, co-occurrence, and catalog)
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
FROM track_cooccurrence
UNION ALL
SELECT 
  from_track_id,
  to_track_id,
  weight,
  edge_type,
  last_seen_ts
FROM track_catalog_edges;
