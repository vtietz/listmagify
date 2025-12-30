/**
 * Database Migration System
 * 
 * Handles schema migrations for SQLite databases (metrics and recs).
 * Uses a simple version-based approach with transaction safety.
 * 
 * Each migration is an SQL string or function that receives the db.
 * Migrations run in order and are tracked in a _migrations table.
 */

import type { Database as BetterSqlite3Database } from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  sql: string | ((db: BetterSqlite3Database) => void);
}

/**
 * Ensure the migrations tracking table exists.
 */
function ensureMigrationsTable(db: BetterSqlite3Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
}

/**
 * Get the current schema version.
 */
function getCurrentVersion(db: BetterSqlite3Database): number {
  const row = db.prepare(
    'SELECT MAX(version) as version FROM _migrations'
  ).get() as { version: number | null } | undefined;
  
  return row?.version ?? 0;
}

/**
 * Run pending migrations for a database.
 * 
 * @param db - The SQLite database instance
 * @param migrations - Array of migrations to apply
 * @param dbName - Name for logging (e.g., 'metrics', 'recs')
 * @returns Number of migrations applied
 */
export function runMigrations(
  db: BetterSqlite3Database,
  migrations: Migration[],
  dbName: string = 'db'
): number {
  ensureMigrationsTable(db);
  
  const currentVersion = getCurrentVersion(db);
  const pending = migrations
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);
  
  if (pending.length === 0) {
    return 0;
  }
  
  console.log(`[${dbName}] Running ${pending.length} migration(s) from v${currentVersion}...`);
  
  let applied = 0;
  
  for (const migration of pending) {
    try {
      // Run migration in a transaction
      db.transaction(() => {
        console.log(`[${dbName}] Applying migration ${migration.version}: ${migration.name}`);
        
        if (typeof migration.sql === 'string') {
          db.exec(migration.sql);
        } else {
          migration.sql(db);
        }
        
        // Record migration
        db.prepare(
          'INSERT INTO _migrations (version, name) VALUES (?, ?)'
        ).run(migration.version, migration.name);
      })();
      
      applied++;
    } catch (error) {
      console.error(`[${dbName}] Migration ${migration.version} failed:`, error);
      throw error;
    }
  }
  
  console.log(`[${dbName}] Applied ${applied} migration(s), now at v${getCurrentVersion(db)}`);
  return applied;
}

/**
 * Get migration status for a database.
 */
export function getMigrationStatus(
  db: BetterSqlite3Database,
  migrations: Migration[]
): {
  currentVersion: number;
  latestVersion: number;
  pendingCount: number;
  appliedMigrations: Array<{ version: number; name: string; applied_at: number }>;
} {
  ensureMigrationsTable(db);
  
  const currentVersion = getCurrentVersion(db);
  const latestVersion = migrations.length > 0 
    ? Math.max(...migrations.map(m => m.version)) 
    : 0;
  
  const appliedMigrations = db.prepare(
    'SELECT version, name, applied_at FROM _migrations ORDER BY version'
  ).all() as Array<{ version: number; name: string; applied_at: number }>;
  
  return {
    currentVersion,
    latestVersion,
    pendingCount: migrations.filter(m => m.version > currentVersion).length,
    appliedMigrations,
  };
}
