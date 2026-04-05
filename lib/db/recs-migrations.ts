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
  {
    version: 4,
    name: 'add_canonical_track_model',
    sql: `
      CREATE TABLE IF NOT EXISTS canonical_tracks (
        id TEXT PRIMARY KEY,
        isrc TEXT,
        title_norm TEXT NOT NULL,
        artist_norm TEXT NOT NULL,
        duration_sec INTEGER,
        album_upc TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_canonical_tracks_isrc ON canonical_tracks(isrc);
      CREATE INDEX IF NOT EXISTS idx_canonical_tracks_title_artist ON canonical_tracks(title_norm, artist_norm);

      CREATE TABLE IF NOT EXISTS provider_track_map (
        provider TEXT NOT NULL CHECK(provider IN ('spotify','tidal')),
        provider_track_id TEXT NOT NULL,
        canonical_track_id TEXT NOT NULL REFERENCES canonical_tracks(id),
        isrc TEXT,
        match_score REAL NOT NULL,
        confidence TEXT NOT NULL CHECK(confidence IN ('high','medium','low')),
        resolved_at TEXT NOT NULL,
        UNIQUE(provider, provider_track_id)
      );
      CREATE INDEX IF NOT EXISTS idx_provider_track_map_canonical ON provider_track_map(canonical_track_id);

      CREATE TABLE IF NOT EXISTS rec_edges_canonical (
        src_canonical_track_id TEXT NOT NULL REFERENCES canonical_tracks(id),
        dst_canonical_track_id TEXT NOT NULL REFERENCES canonical_tracks(id),
        weight REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('sequential','cooccur')),
        created_at TEXT NOT NULL,
        PRIMARY KEY(src_canonical_track_id, dst_canonical_track_id, type)
      );
      CREATE INDEX IF NOT EXISTS idx_rec_edges_canonical_src ON rec_edges_canonical(src_canonical_track_id, type);
      CREATE INDEX IF NOT EXISTS idx_rec_edges_canonical_dst ON rec_edges_canonical(dst_canonical_track_id, type);
    `,
  },
  {
    version: 5,
    name: 'add_sync_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS sync_pairs (
        id TEXT PRIMARY KEY,
        source_provider TEXT NOT NULL CHECK(source_provider IN ('spotify','tidal')),
        source_playlist_id TEXT NOT NULL,
        target_provider TEXT NOT NULL CHECK(target_provider IN ('spotify','tidal')),
        target_playlist_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('a-to-b','b-to-a','bidirectional')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_provider, source_playlist_id, target_provider, target_playlist_id)
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY,
        sync_pair_id TEXT NOT NULL REFERENCES sync_pairs(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('pending','previewing','executing','done','failed')),
        direction TEXT NOT NULL CHECK(direction IN ('a-to-b','b-to-a','bidirectional')),
        tracks_added INTEGER NOT NULL DEFAULT 0,
        tracks_removed INTEGER NOT NULL DEFAULT 0,
        tracks_unresolved INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sync_runs_pair ON sync_runs(sync_pair_id);
      CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs(status);
    `,
  },
  {
    version: 6,
    name: 'add_sync_user_scoping',
    sql: `
      ALTER TABLE sync_pairs ADD COLUMN created_by TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_sync_pairs_created_by ON sync_pairs(created_by);
    `,
  },
  {
    version: 7,
    name: 'add_sync_playlist_names',
    sql: `
      ALTER TABLE sync_pairs ADD COLUMN source_playlist_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE sync_pairs ADD COLUMN target_playlist_name TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 8,
    name: 'add_auto_sync_column',
    sql: `
      ALTER TABLE sync_pairs ADD COLUMN auto_sync INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 9,
    name: 'add_sync_scheduler_columns',
    sql: `
      ALTER TABLE sync_pairs ADD COLUMN sync_interval TEXT NOT NULL DEFAULT 'off';
      ALTER TABLE sync_pairs ADD COLUMN next_run_at TEXT;
      ALTER TABLE sync_pairs ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sync_runs ADD COLUMN warnings_json TEXT;
      ALTER TABLE sync_runs ADD COLUMN triggered_by TEXT NOT NULL DEFAULT 'manual';
      CREATE INDEX IF NOT EXISTS idx_sync_pairs_next_run ON sync_pairs(next_run_at);
    `,
  },
  {
    version: 10,
    name: 'add_import_jobs',
    sql: `
      CREATE TABLE IF NOT EXISTS import_jobs (
        id TEXT PRIMARY KEY,
        source_provider TEXT NOT NULL,
        target_provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by ON import_jobs(created_by);
      CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);

      CREATE TABLE IF NOT EXISTS import_job_playlists (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
        source_playlist_id TEXT NOT NULL,
        source_playlist_name TEXT NOT NULL,
        target_playlist_id TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        track_count INTEGER NOT NULL DEFAULT 0,
        tracks_resolved INTEGER NOT NULL DEFAULT 0,
        tracks_added INTEGER NOT NULL DEFAULT 0,
        tracks_unresolved INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        position INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_import_job_playlists_job ON import_job_playlists(job_id);
    `,
  },
  {
    version: 11,
    name: 'import_jobs_sync_fields',
    sql: `
      ALTER TABLE import_jobs ADD COLUMN create_sync_pair INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE import_jobs ADD COLUMN sync_interval TEXT NOT NULL DEFAULT 'off';
    `,
  },
  {
    version: 12,
    name: 'prefix_created_by_ids',
    sql: `
      -- Before provider-prefixed IDs, created_by stored raw account IDs (e.g. "simsonoo").
      -- TIDAL was not yet supported, so all unprefixed IDs are Spotify users.
      UPDATE sync_pairs
        SET created_by = 'spotify:' || created_by
        WHERE created_by != '' AND created_by NOT LIKE '%:%';

      UPDATE import_jobs
        SET created_by = 'spotify:' || created_by
        WHERE created_by != '' AND created_by NOT LIKE '%:%';
    `,
  },
  {
    version: 13,
    name: 'add_sync_pair_provider_user_ids',
    sql: `
      ALTER TABLE sync_pairs ADD COLUMN provider_user_ids TEXT NOT NULL DEFAULT '{}';
    `,
  },
  {
    version: 14,
    name: 'add_sync_pair_snapshot_ids',
    sql: `
      ALTER TABLE sync_pairs ADD COLUMN source_snapshot_id TEXT;
      ALTER TABLE sync_pairs ADD COLUMN target_snapshot_id TEXT;
    `,
  },
];
