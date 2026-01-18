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
import { runMigrations, getMigrationStatus } from '@/lib/db';
import { metricsMigrations } from '@/lib/db/metrics-migrations';

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
    
    // Run migrations
    runMigrations(db, metricsMigrations, 'metrics');
    
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
 * Get migration status for the metrics database.
 */
export function getMetricsMigrationStatus() {
  const database = getDb();
  if (!database) return null;
  return getMigrationStatus(database, metricsMigrations);
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

/**
 * Get the size of the database file in bytes.
 * Returns null if metrics are disabled or file doesn't exist.
 */
export function getDatabaseSize(): { sizeBytes: number; sizeMB: number } | null {
  const config = getMetricsConfig();
  
  if (!config.enabled) {
    return null;
  }

  try {
    const stats = fs.statSync(config.dbPath);
    const sizeBytes = stats.size;
    const sizeMB = sizeBytes / (1024 * 1024);
    
    return {
      sizeBytes,
      sizeMB: Math.round(sizeMB * 100) / 100, // Round to 2 decimal places
    };
  } catch (error) {
    console.error('[metrics] Failed to get database size:', error);
    return null;
  }
}
