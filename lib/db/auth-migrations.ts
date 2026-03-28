/**
 * Auth Database Migrations
 *
 * Each migration should be additive and idempotent where possible.
 * Version numbers must be unique and sequential.
 */

import type { Migration } from './migrations';

/**
 * Migrations for the auth token database.
 *
 * Version 1 represents the initial schema for encrypted token storage.
 */
export const authMigrations: Migration[] = [
  {
    version: 1,
    name: 'create_user_tokens',
    sql: `
      CREATE TABLE IF NOT EXISTS user_tokens (
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL CHECK(provider IN ('spotify','tidal')),
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        access_token_expires INTEGER,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','needs_reauth','revoked')),
        is_byok INTEGER NOT NULL DEFAULT 0,
        byok_client_id TEXT,
        byok_client_secret TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, provider)
      );
    `,
  },
];
