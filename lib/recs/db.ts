/**
 * Database connection and initialization for the recommendation system.
 * Uses better-sqlite3 for synchronous SQLite operations with WAL mode.
 */

import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { recsEnv } from "./env";
import { runMigrations, getMigrationStatus } from "@/lib/db";
import { recsMigrations } from "@/lib/db/recs-migrations";

/** Singleton database instance */
let _db: Database.Database | null = null;

/**
 * Resolves the database path, handling relative and absolute paths.
 */
function resolveDatabasePath(): string {
  const dbPath = recsEnv.RECS_DB_PATH;
  
  // If absolute path, use as-is
  if (dbPath.startsWith("/")) {
    return dbPath;
  }
  
  // Resolve relative to project root (cwd)
  return resolve(process.cwd(), dbPath);
}

/**
 * Initialize the SQLite database with migrations.
 * Creates the database file and directory if they don't exist.
 */
function initializeDatabase(): Database.Database {
  const dbPath = resolveDatabasePath();
  const dbDir = dirname(dbPath);
  
  // Ensure directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  // Open database with WAL mode enabled
  const db = new Database(dbPath);
  
  // Enable WAL mode for better concurrency
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  
  // Run migrations
  runMigrations(db, recsMigrations, 'recs');
  
  return db;
}

/**
 * Get or create the database connection singleton.
 * Thread-safe for Node.js single-threaded model.
 */
export function getRecsDb(): Database.Database {
  if (!recsEnv.RECS_ENABLED) {
    throw new Error("Recommendation system is disabled. Set RECS_ENABLED=true to enable.");
  }
  
  if (!_db) {
    _db = initializeDatabase();
  }
  
  return _db;
}

/**
 * Close the database connection gracefully.
 * Call this during application shutdown.
 */
export function closeRecsDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/**
 * Check if the recommendation system is available.
 */
export function isRecsAvailable(): boolean {
  return recsEnv.RECS_ENABLED;
}

/**
 * Get migration status for the recs database.
 */
export function getRecsMigrationStatus() {
  if (!isRecsAvailable()) return null;
  const db = getRecsDb();
  return getMigrationStatus(db, recsMigrations);
}

/**
 * Run a database transaction with automatic rollback on error.
 */
export function withTransaction<T>(fn: (db: Database.Database) => T): T {
  const db = getRecsDb();
  return db.transaction(fn)(db);
}

/**
 * Prepared statement cache for frequently used queries.
 */
const statementCache = new Map<string, Database.Statement>();

/**
 * Get or create a prepared statement (cached for performance).
 */
export function getStatement(sql: string): Database.Statement {
  let stmt = statementCache.get(sql);
  if (!stmt) {
    const db = getRecsDb();
    stmt = db.prepare(sql);
    statementCache.set(sql, stmt);
  }
  return stmt;
}

/**
 * Clear the statement cache (call after schema changes or DB reconnect).
 */
export function clearStatementCache(): void {
  statementCache.clear();
}

/**
 * Get current Unix timestamp in seconds.
 */
export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Types for database rows.
 */
export interface TrackRow {
  track_id: string;
  uri: string;
  name: string;
  artist_ids: string | null;
  album_id: string | null;
  genres: string | null;
  popularity: number | null;
  duration_ms: number | null;
  updated_at: number;
}

export interface PlaylistTrackRow {
  playlist_id: string;
  track_id: string;
  position: number;
  snapshot_ts: number;
}

export interface TrackEdgeSeqRow {
  from_track_id: string;
  to_track_id: string;
  weight_seq: number;
  last_seen_ts: number;
}

export interface TrackCooccurrenceRow {
  track_id_a: string;
  track_id_b: string;
  weight_co: number;
  last_seen_ts: number;
}

export interface ArtistTopTrackRow {
  artist_id: string;
  market: string;
  track_id: string;
  rank: number;
  fetched_at: number;
}

export interface AlbumTrackRow {
  album_id: string;
  track_id: string;
  position: number;
  fetched_at: number;
}

export interface TrackPopularityRow {
  track_id: string;
  popularity: number;
  fetched_at: number;
}

export interface TrackCatalogEdgeRow {
  edge_type: string;
  from_track_id: string;
  to_track_id: string;
  weight: number;
  last_seen_ts: number;
}
