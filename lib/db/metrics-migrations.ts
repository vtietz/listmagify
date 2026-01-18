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
  {
    version: 4,
    name: 'feedback_optional_score_and_contact_fields',
    // Note: Migration runner already wraps in transaction, so no BEGIN/COMMIT needed
    sql: `
      -- Make nps_score optional and add optional contact fields (name/email)
      -- SQLite can't change column constraints in-place, so we recreate the table.
      PRAGMA foreign_keys=OFF;

      CREATE TABLE IF NOT EXISTS feedback_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_hash TEXT,
        nps_score INTEGER CHECK (nps_score IS NULL OR (nps_score >= 0 AND nps_score <= 10)),
        comment TEXT,
        name TEXT,
        email TEXT
      );

      INSERT INTO feedback_new (id, ts, user_hash, nps_score, comment)
      SELECT id, ts, user_hash, nps_score, comment
      FROM feedback;

      DROP TABLE feedback;
      ALTER TABLE feedback_new RENAME TO feedback;

      CREATE INDEX IF NOT EXISTS idx_feedback_ts ON feedback(ts);
      CREATE INDEX IF NOT EXISTS idx_feedback_nps ON feedback(nps_score);

      PRAGMA foreign_keys=ON;
    `,
  },
  {
    version: 5,
    name: 'add_user_registrations_table',
    sql: `
      -- User registrations table - tracks first login time for registration stats
      CREATE TABLE IF NOT EXISTS user_registrations (
        user_id TEXT PRIMARY KEY,
        user_hash TEXT NOT NULL,
        registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_registrations_registered_at ON user_registrations(registered_at);
      CREATE INDEX IF NOT EXISTS idx_user_registrations_user_hash ON user_registrations(user_hash);

      -- Backfill existing users from sessions table (earliest session = registration)
      INSERT OR IGNORE INTO user_registrations (user_id, user_hash, registered_at)
      SELECT user_id, user_hash, MIN(started_at) as registered_at
      FROM sessions
      WHERE user_id IS NOT NULL
      GROUP BY user_id, user_hash;
    `,
  },
  {
    version: 6,
    name: 'add_error_reports_and_access_requests_tables',
    sql: `
      -- Error reports table - stores user-submitted error reports
      CREATE TABLE IF NOT EXISTS error_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id TEXT UNIQUE NOT NULL,
        ts DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT,
        user_name TEXT,
        user_hash TEXT,
        error_category TEXT NOT NULL,
        error_severity TEXT NOT NULL,
        error_message TEXT NOT NULL,
        error_details TEXT,
        error_status_code INTEGER,
        error_request_path TEXT,
        user_description TEXT,
        environment_json TEXT,
        app_version TEXT,
        resolved INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_error_reports_ts ON error_reports(ts);
      CREATE INDEX IF NOT EXISTS idx_error_reports_report_id ON error_reports(report_id);
      CREATE INDEX IF NOT EXISTS idx_error_reports_category ON error_reports(error_category);
      CREATE INDEX IF NOT EXISTS idx_error_reports_resolved ON error_reports(resolved);

      -- Access requests table - stores user access requests from landing page
      CREATE TABLE IF NOT EXISTS access_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts DATETIME DEFAULT CURRENT_TIMESTAMP,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        motivation TEXT,
        status TEXT DEFAULT 'pending',
        notes TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_access_requests_ts ON access_requests(ts);
      CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(email);
      CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
    `,
  },
  {
    version: 7,
    name: 'add_is_byok_to_events',
    sql: `
      -- Add is_byok flag to track BYOK (Bring Your Own Key) authentication
      ALTER TABLE events ADD COLUMN is_byok INTEGER DEFAULT 0;
      
      CREATE INDEX IF NOT EXISTS idx_events_is_byok ON events(is_byok);
    `,
  },
  {
    version: 8,
    name: 'add_traffic_analytics',
    sql: `
      -- Traffic analytics table - aggregated page views without logging individual visits
      CREATE TABLE IF NOT EXISTS traffic_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        page_path TEXT NOT NULL,
        country_code TEXT,
        referrer_domain TEXT,
        search_query TEXT,
        utm_source TEXT,
        visit_count INTEGER NOT NULL DEFAULT 1,
        UNIQUE(date, page_path, country_code, referrer_domain, search_query, utm_source)
      );
      
      CREATE INDEX IF NOT EXISTS idx_traffic_date ON traffic_analytics(date);
      CREATE INDEX IF NOT EXISTS idx_traffic_page ON traffic_analytics(page_path);
      CREATE INDEX IF NOT EXISTS idx_traffic_country ON traffic_analytics(country_code);
      CREATE INDEX IF NOT EXISTS idx_traffic_referrer ON traffic_analytics(referrer_domain);
      CREATE INDEX IF NOT EXISTS idx_traffic_utm ON traffic_analytics(utm_source);
    `,
  },
  {
    version: 9,
    name: 'add_utm_source_to_existing_traffic',
    sql: `
      -- Add utm_source column if table already exists from version 8
      -- This handles the case where traffic_analytics was created without utm_source
      ALTER TABLE traffic_analytics ADD COLUMN utm_source TEXT;
      
      -- Recreate the unique constraint to include utm_source
      -- SQLite doesn't support modifying constraints, so we need to recreate the table
      CREATE TABLE IF NOT EXISTS traffic_analytics_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        page_path TEXT NOT NULL,
        country_code TEXT,
        referrer_domain TEXT,
        search_query TEXT,
        utm_source TEXT,
        visit_count INTEGER NOT NULL DEFAULT 1,
        UNIQUE(date, page_path, country_code, referrer_domain, search_query, utm_source)
      );
      
      -- Copy data from old table (utm_source will be NULL for existing rows)
      INSERT INTO traffic_analytics_new (id, date, page_path, country_code, referrer_domain, search_query, utm_source, visit_count)
      SELECT id, date, page_path, country_code, referrer_domain, search_query, utm_source, visit_count
      FROM traffic_analytics;
      
      -- Drop old table and rename new one
      DROP TABLE traffic_analytics;
      ALTER TABLE traffic_analytics_new RENAME TO traffic_analytics;
      
      -- Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_traffic_date ON traffic_analytics(date);
      CREATE INDEX IF NOT EXISTS idx_traffic_page ON traffic_analytics(page_path);
      CREATE INDEX IF NOT EXISTS idx_traffic_country ON traffic_analytics(country_code);
      CREATE INDEX IF NOT EXISTS idx_traffic_referrer ON traffic_analytics(referrer_domain);
      CREATE INDEX IF NOT EXISTS idx_traffic_utm ON traffic_analytics(utm_source);
    `,
  },
  {
    version: 10,
    name: 'add_spotify_username_to_access_requests',
    sql: `
      -- Add spotify_username column to access_requests table
      ALTER TABLE access_requests ADD COLUMN spotify_username TEXT;
      
      CREATE INDEX IF NOT EXISTS idx_access_requests_spotify_username ON access_requests(spotify_username);
    `,
  },
  {
    version: 11,
    name: 'add_red_flags_to_access_requests',
    sql: `
      -- Add red_flags column to store JSON array of suspicious patterns detected
      ALTER TABLE access_requests ADD COLUMN red_flags TEXT;
      
      CREATE INDEX IF NOT EXISTS idx_access_requests_red_flags ON access_requests(red_flags);
    `,
  },
];
