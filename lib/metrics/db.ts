/**
 * SQLite database initialization for metrics.
 * Uses better-sqlite3 - synchronous, native SQLite bindings for Node.js.
 * 
 * Tables:
 * - events: Raw event log with hashed user IDs
 * - sessions: Session tracking for duration calculations
 * - aggregates_daily: Pre-computed daily aggregates
 */

import Database from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getMetricsConfig } from './env';

let db: BetterSqlite3Database | null = null;

/**
 * Get or initialize the database connection.
 * Returns null if metrics are disabled.
 */
export function getDb(): BetterSqlite3Database | null {
  const config = getMetricsConfig();
  
  if (!config.enabled) {
    return null;
  }

  if (db) {
    return db;
  }

  try {
    // Ensure data directory exists
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    console.log(`[metrics] Opening database at: ${config.dbPath}`);
    
    // Open database (creates if doesn't exist)
    db = new Database(config.dbPath);
    
    // Enable WAL mode for better concurrent performance
    db.pragma('journal_mode = WAL');
    
    // Bootstrap tables
    bootstrapTables(db);
    
    console.log('[metrics] Database initialized successfully');
    return db;
  } catch (error) {
    console.error('[metrics] Failed to initialize database:', error);
    return null;
  }
}

/**
 * Async version for compatibility - just wraps sync getDb.
 */
export async function getDbAsync(): Promise<BetterSqlite3Database | null> {
  return getDb();
}

/**
 * Create tables if they don't exist.
 */
function bootstrapTables(database: BetterSqlite3Database): void {
  // Events table - raw event log
  database.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_hash TEXT,
      event TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'api',
      entity_type TEXT,
      entity_id TEXT,
      count INTEGER,
      duration_ms INTEGER,
      success INTEGER,
      error_code TEXT,
      meta_json TEXT
    )
  `);
  
  database.exec(`CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_events_event ON events(event)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_events_user_hash ON events(user_hash)`);

  // Sessions table - for session duration tracking
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_hash TEXT NOT NULL,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      user_agent TEXT
    )
  `);
  
  database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user_hash ON sessions(user_hash)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at)`);

  // Daily aggregates - pre-computed for dashboard performance
  database.exec(`
    CREATE TABLE IF NOT EXISTS aggregates_daily (
      day DATE NOT NULL,
      event TEXT NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0,
      unique_users INTEGER NOT NULL DEFAULT 0,
      avg_duration_ms INTEGER,
      errors INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, event)
    )
  `);
  
  database.exec(`CREATE INDEX IF NOT EXISTS idx_aggregates_day ON aggregates_daily(day)`);
}

/**
 * Close the database connection gracefully.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Flush database - for better-sqlite3 with WAL mode, run checkpoint.
 */
export function flushDb(): void {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Ignore checkpoint errors
    }
  }
}

/**
 * Run retention cleanup - delete raw events older than 180 days.
 * Keep aggregates for up to 1 year.
 */
export function runRetentionCleanup(): { eventsDeleted: number; aggregatesDeleted: number } {
  const database = getDb();
  if (!database) {
    return { eventsDeleted: 0, aggregatesDeleted: 0 };
  }

  // Delete raw events older than 180 days
  const eventsResult = database.prepare(`DELETE FROM events WHERE ts < datetime('now', '-180 days')`).run();
  const eventsDeleted = eventsResult.changes;

  // Delete sessions older than 180 days
  database.prepare(`DELETE FROM sessions WHERE started_at < datetime('now', '-180 days')`).run();

  // Delete aggregates older than 1 year
  const aggregatesResult = database.prepare(`DELETE FROM aggregates_daily WHERE day < date('now', '-1 year')`).run();
  const aggregatesDeleted = aggregatesResult.changes;

  return {
    eventsDeleted,
    aggregatesDeleted,
  };
}

// ---------- Query Helper Functions ----------

/**
 * Execute a parameterized query that returns rows.
 */
export function queryAll<T>(
  sql: string,
  params: (string | number | null)[] = []
): T[] {
  const database = getDb();
  if (!database) return [];

  const stmt = database.prepare(sql);
  return stmt.all(...params) as T[];
}

/**
 * Execute a parameterized query that returns a single row.
 */
export function queryOne<T>(
  sql: string,
  params: (string | number | null)[] = []
): T | null {
  const database = getDb();
  if (!database) return null;

  const stmt = database.prepare(sql);
  return (stmt.get(...params) as T) ?? null;
}

/**
 * Execute a parameterized INSERT/UPDATE/DELETE statement.
 * Returns the number of rows modified.
 */
export function execute(
  sql: string,
  params: (string | number | null)[] = []
): number {
  const database = getDb();
  if (!database) return 0;

  const stmt = database.prepare(sql);
  const result = stmt.run(...params);
  return result.changes;
}
