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
  {
    version: 2,
    name: 'add_user_id_for_profile_fetching',
    sql: `
      -- Add user_id column to store actual Spotify user IDs (for profile fetching)
      -- Keep user_hash for privacy-preserving aggregations
      ALTER TABLE events ADD COLUMN user_id TEXT;
      ALTER TABLE sessions ADD COLUMN user_id TEXT;
      
      -- Index for efficient user lookups
      CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    `,
  },
  {
    version: 3,
    name: 'add_feedback_table',
    sql: `
      -- Feedback table for NPS scores and comments
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_hash TEXT,
        nps_score INTEGER NOT NULL CHECK (nps_score >= 0 AND nps_score <= 10),
        comment TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_feedback_ts ON feedback(ts);
      CREATE INDEX IF NOT EXISTS idx_feedback_nps ON feedback(nps_score);
    `,
  },
];
