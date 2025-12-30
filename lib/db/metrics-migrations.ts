/**
 * Metrics Database Migrations
 * 
 * Each migration should be additive and idempotent where possible.
 * Version numbers must be unique and sequential.
 */

import type { Migration } from './migrations';

/**
 * Migrations for the metrics database.
 * 
 * Version 1 represents the initial schema that was created via bootstrapTables().
 * Future versions add incremental changes.
 */
export const metricsMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      -- Events table - raw event log
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
      );
      
      CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
      CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
      CREATE INDEX IF NOT EXISTS idx_events_user_hash ON events(user_hash);

      -- Sessions table - for session duration tracking
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_hash TEXT NOT NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        user_agent TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_sessions_user_hash ON sessions(user_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

      -- Daily aggregates - pre-computed for dashboard performance
      CREATE TABLE IF NOT EXISTS aggregates_daily (
        day DATE NOT NULL,
        event TEXT NOT NULL,
        total_count INTEGER NOT NULL DEFAULT 0,
        unique_users INTEGER NOT NULL DEFAULT 0,
        avg_duration_ms INTEGER,
        errors INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, event)
      );
      
      CREATE INDEX IF NOT EXISTS idx_aggregates_day ON aggregates_daily(day);
    `,
  },
  // Future migrations go here:
  // {
  //   version: 2,
  //   name: 'add_user_preferences',
  //   sql: 'ALTER TABLE sessions ADD COLUMN preferences_json TEXT;',
  // },
];
