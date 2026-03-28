/**
 * Database connection and initialization for encrypted token storage.
 * Uses better-sqlite3 for synchronous SQLite operations with WAL mode.
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { runMigrations } from '@/lib/db';
import { authMigrations } from '@/lib/db/auth-migrations';

/** Singleton database instance */
let _db: Database.Database | null = null;

const AUTH_DB_PATH = process.env.AUTH_DB_PATH ?? './data/auth.db';

/**
 * Resolves the database path, handling relative and absolute paths.
 */
function resolvePath(): string {
  if (AUTH_DB_PATH.startsWith('/')) {
    return AUTH_DB_PATH;
  }
  return resolve(process.cwd(), AUTH_DB_PATH);
}

/**
 * Initialize the SQLite database with migrations.
 * Creates the database file and directory if they don't exist.
 */
function initializeDatabase(): Database.Database {
  const dbPath = resolvePath();
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db, authMigrations, 'auth');
  return db;
}

/**
 * Get or create the database connection singleton.
 */
export function getAuthDb(): Database.Database {
  if (!_db) {
    _db = initializeDatabase();
  }
  return _db;
}

/**
 * Close the database connection gracefully.
 * Call this during application shutdown.
 */
export function closeAuthDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
