/**
 * Recommendations Database Migrations
 * 
 * Each migration should be additive and idempotent where possible.
 * Version numbers must be unique and sequential.
 */

import type { Migration } from './migrations';

/**
 * Migrations for the recommendations database.
 * 
 * Version 1 represents the initial schema.
 * Future versions add incremental changes.
 */
export const recsMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      -- Track metadata cache
      CREATE TABLE IF NOT EXISTS tracks (
        track_id TEXT PRIMARY KEY,
        uri TEXT NOT NULL,
        name TEXT NOT NULL,
        artist_ids TEXT,
        album_id TEXT,
        genres TEXT,
        popularity INTEGER,
        duration_ms INTEGER,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);

      -- Playlist track snapshots
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        snapshot_ts INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (playlist_id, track_id, snapshot_ts)
      );
      CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_snapshot ON playlist_tracks(playlist_id, snapshot_ts);
      CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);

      -- Sequential adjacency edges
      CREATE TABLE IF NOT EXISTS track_edges_seq (
        from_track_id TEXT NOT NULL,
        to_track_id TEXT NOT NULL,
        weight_seq REAL NOT NULL DEFAULT 1.0,
        last_seen_ts INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (from_track_id, to_track_id)
      );
      CREATE INDEX IF NOT EXISTS idx_track_edges_seq_from ON track_edges_seq(from_track_id);

      -- Co-occurrence edges
      CREATE TABLE IF NOT EXISTS track_cooccurrence (
        track_id_a TEXT NOT NULL,
        track_id_b TEXT NOT NULL,
        weight_co REAL NOT NULL DEFAULT 1.0,
        last_seen_ts INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (track_id_a, track_id_b)
      );
      CREATE INDEX IF NOT EXISTS idx_track_cooccurrence_a ON track_cooccurrence(track_id_a);
      CREATE INDEX IF NOT EXISTS idx_track_cooccurrence_b ON track_cooccurrence(track_id_b);

      -- Audio feature vectors
      CREATE TABLE IF NOT EXISTS track_features (
        track_id TEXT PRIMARY KEY,
        vector TEXT NOT NULL,
        dim INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'spotify',
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      -- Artist top tracks
      CREATE TABLE IF NOT EXISTS artist_top_tracks (
        artist_id TEXT NOT NULL,
        market TEXT NOT NULL,
        track_id TEXT NOT NULL,
        rank INTEGER NOT NULL,
        fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (artist_id, market, track_id)
      );
      CREATE INDEX IF NOT EXISTS idx_artist_top_tracks_artist_market ON artist_top_tracks(artist_id, market);

      -- Album tracks
      CREATE TABLE IF NOT EXISTS album_tracks (
        album_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (album_id, track_id)
      );
      CREATE INDEX IF NOT EXISTS idx_album_tracks_album ON album_tracks(album_id);

      -- Track popularity cache
      CREATE TABLE IF NOT EXISTS track_popularity (
        track_id TEXT PRIMARY KEY,
        popularity INTEGER NOT NULL,
        fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      -- Related artists
      CREATE TABLE IF NOT EXISTS related_artists (
        artist_id TEXT NOT NULL,
        related_artist_id TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (artist_id, related_artist_id)
      );
      CREATE INDEX IF NOT EXISTS idx_related_artists_artist ON related_artists(artist_id);

      -- Catalog-derived edges
      CREATE TABLE IF NOT EXISTS track_catalog_edges (
        edge_type TEXT NOT NULL,
        from_track_id TEXT NOT NULL,
        to_track_id TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        last_seen_ts INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (edge_type, from_track_id, to_track_id)
      );
      CREATE INDEX IF NOT EXISTS idx_track_catalog_edges_type_from ON track_catalog_edges(edge_type, from_track_id);

      -- System metadata
      CREATE TABLE IF NOT EXISTS recs_metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      -- Dismissed recommendations
      CREATE TABLE IF NOT EXISTS dismissed_recommendations (
        context_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        dismissed_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (context_id, track_id)
      );
      CREATE INDEX IF NOT EXISTS idx_dismissed_context ON dismissed_recommendations(context_id);

      -- All edges view
      CREATE VIEW IF NOT EXISTS v_all_track_edges AS
      SELECT 
        from_track_id, to_track_id, weight_seq as weight, 'seq' as edge_type, last_seen_ts
      FROM track_edges_seq
      UNION ALL
      SELECT 
        track_id_a as from_track_id, track_id_b as to_track_id, weight_co as weight, 'cooccur' as edge_type, last_seen_ts
      FROM track_cooccurrence
      UNION ALL
      SELECT 
        track_id_b as from_track_id, track_id_a as to_track_id, weight_co as weight, 'cooccur' as edge_type, last_seen_ts
      FROM track_cooccurrence
      UNION ALL
      SELECT 
        from_track_id, to_track_id, weight, edge_type, last_seen_ts
      FROM track_catalog_edges;
    `,
  },
  {
    version: 2,
    name: 'remove_unused_tables',
    sql: `
      -- Remove unused catalog tables (feature was never implemented)
      DROP TABLE IF EXISTS playlist_tracks;
      DROP TABLE IF EXISTS track_features;
      DROP TABLE IF EXISTS artist_top_tracks;
      DROP TABLE IF EXISTS album_tracks;
      DROP TABLE IF EXISTS track_popularity;
      DROP TABLE IF EXISTS related_artists;
      DROP TABLE IF EXISTS track_catalog_edges;
      DROP TABLE IF EXISTS recs_metadata;
      
      -- Recreate view without catalog edges reference
      DROP VIEW IF EXISTS v_all_track_edges;
      CREATE VIEW IF NOT EXISTS v_all_track_edges AS
      SELECT 
        from_track_id, to_track_id, weight_seq as weight, 'seq' as edge_type, last_seen_ts
      FROM track_edges_seq
      UNION ALL
      SELECT 
        track_id_a as from_track_id, track_id_b as to_track_id, weight_co as weight, 'cooccur' as edge_type, last_seen_ts
      FROM track_cooccurrence
      UNION ALL
      SELECT 
        track_id_b as from_track_id, track_id_a as to_track_id, weight_co as weight, 'cooccur' as edge_type, last_seen_ts
      FROM track_cooccurrence;
    `,
  },
  {
    version: 3,
    name: 'add_artist_column',
    sql: `
      -- Add artist column for display purposes
      ALTER TABLE tracks ADD COLUMN artist TEXT;
    `,
  },
];
