/**
 * Encrypted token CRUD operations for persistent provider token storage.
 *
 * All token values (access_token, refresh_token, byok_client_secret)
 * are encrypted at rest using AES-256-GCM. When TOKEN_ENCRYPTION_KEY
 * is not configured, persistence is silently skipped (graceful degradation).
 */

import { getAuthDb } from './tokenDb';
import { encryptToken, decryptToken, isTokenEncryptionAvailable } from './tokenEncryption';
import type { MusicProviderId } from '@/lib/music-provider/types';

export type TokenStatus = 'active' | 'needs_reauth' | 'revoked';

export interface StoredProviderToken {
  userId: string;
  provider: MusicProviderId;
  accessToken: string;
  refreshToken: string;
  accessTokenExpires: number | null;
  status: TokenStatus;
  isByok: boolean;
  byokClientId: string | null;
  byokClientSecret: string | null;
  updatedAt: string;
}

interface TokenRow {
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string;
  access_token_expires: number | null;
  status: string;
  is_byok: number;
  byok_client_id: string | null;
  byok_client_secret: string | null;
  updated_at: string;
}

interface PersistParams {
  userId: string;
  provider: MusicProviderId;
  accessToken: string;
  refreshToken: string;
  accessTokenExpires?: number | null;
  isByok?: boolean;
  byokClientId?: string | null;
  byokClientSecret?: string | null;
}

function rowToStoredToken(row: TokenRow): StoredProviderToken | null {
  try {
    const accessToken = decryptToken(row.access_token);
    const refreshToken = decryptToken(row.refresh_token);
    const byokClientSecret = row.byok_client_secret
      ? decryptToken(row.byok_client_secret)
      : null;

    return {
      userId: row.user_id,
      provider: row.provider as MusicProviderId,
      accessToken,
      refreshToken,
      accessTokenExpires: row.access_token_expires,
      status: row.status as TokenStatus,
      isByok: row.is_byok === 1,
      byokClientId: row.byok_client_id,
      byokClientSecret,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    console.error('[auth-token-store] Failed to decrypt token row:', error);
    return null;
  }
}

/**
 * Persist provider tokens with encryption.
 * Uses INSERT ... ON CONFLICT DO UPDATE (upsert).
 * Silently skips if encryption is not available.
 */
export function persistProviderTokens(params: PersistParams): boolean {
  if (!isTokenEncryptionAvailable()) {
    console.debug('[auth-token-store] Skipping token persistence: TOKEN_ENCRYPTION_KEY not set');
    return false;
  }

  try {
    const db = getAuthDb();
    const encryptedAccessToken = encryptToken(params.accessToken);
    const encryptedRefreshToken = encryptToken(params.refreshToken);
    const encryptedByokSecret = params.byokClientSecret
      ? encryptToken(params.byokClientSecret)
      : null;

    const stmt = db.prepare(`
      INSERT INTO user_tokens (
        user_id, provider, access_token, refresh_token, access_token_expires,
        status, is_byok, byok_client_id, byok_client_secret, updated_at
      ) VALUES (
        @userId, @provider, @accessToken, @refreshToken, @accessTokenExpires,
        'active', @isByok, @byokClientId, @byokClientSecret, CURRENT_TIMESTAMP
      )
      ON CONFLICT(user_id, provider) DO UPDATE SET
        access_token = @accessToken,
        refresh_token = @refreshToken,
        access_token_expires = @accessTokenExpires,
        status = 'active',
        is_byok = @isByok,
        byok_client_id = @byokClientId,
        byok_client_secret = @byokClientSecret,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run({
      userId: params.userId,
      provider: params.provider,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      accessTokenExpires: params.accessTokenExpires ?? null,
      isByok: params.isByok ? 1 : 0,
      byokClientId: params.byokClientId ?? null,
      byokClientSecret: encryptedByokSecret,
    });

    return true;
  } catch (error) {
    console.error('[auth-token-store] Failed to persist tokens:', error);
    return false;
  }
}

/**
 * Retrieve active provider tokens for a user/provider pair.
 * Returns null if no active tokens exist or decryption fails.
 */
export function getProviderTokens(
  userId: string,
  provider: MusicProviderId
): StoredProviderToken | null {
  if (!isTokenEncryptionAvailable()) {
    return null;
  }

  try {
    const db = getAuthDb();
    const row = db
      .prepare(
        `SELECT * FROM user_tokens WHERE user_id = ? AND provider = ? AND status = 'active'`
      )
      .get(userId, provider) as TokenRow | undefined;

    if (!row) {
      return null;
    }

    return rowToStoredToken(row);
  } catch (error) {
    console.error('[auth-token-store] Failed to get tokens:', error);
    return null;
  }
}

/**
 * Get any active token for a provider, regardless of user ID.
 * Used as a fallback when multi-provider auth stores tokens under
 * different user IDs (e.g. Spotify username vs TIDAL numeric ID).
 */
export function getProviderTokensByProvider(
  provider: MusicProviderId
): StoredProviderToken | null {
  if (!isTokenEncryptionAvailable()) {
    return null;
  }

  try {
    const db = getAuthDb();
    const row = db
      .prepare(
        `SELECT * FROM user_tokens WHERE provider = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1`
      )
      .get(provider) as TokenRow | undefined;

    if (!row) {
      return null;
    }

    return rowToStoredToken(row);
  } catch (error) {
    console.error('[auth-token-store] Failed to get tokens by provider:', error);
    return null;
  }
}

/**
 * Delete provider tokens for a user/provider pair.
 */
export function deleteProviderTokens(
  userId: string,
  provider: MusicProviderId
): boolean {
  if (!isTokenEncryptionAvailable()) {
    return false;
  }

  try {
    const db = getAuthDb();
    const result = db
      .prepare('DELETE FROM user_tokens WHERE user_id = ? AND provider = ?')
      .run(userId, provider);

    console.debug(
      `[auth-token-store] Deleted tokens for ${provider}/${userId}: ${result.changes} row(s)`
    );
    return result.changes > 0;
  } catch (error) {
    console.error('[auth-token-store] Failed to delete tokens:', error);
    return false;
  }
}

/**
 * Update the status of a token row (e.g., mark as needs_reauth or revoked).
 */
export function markTokenStatus(
  userId: string,
  provider: MusicProviderId,
  status: TokenStatus
): boolean {
  if (!isTokenEncryptionAvailable()) {
    return false;
  }

  try {
    const db = getAuthDb();
    const result = db
      .prepare(
        'UPDATE user_tokens SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND provider = ?'
      )
      .run(status, userId, provider);

    console.debug(
      `[auth-token-store] Marked ${provider}/${userId} as ${status}: ${result.changes} row(s)`
    );
    return result.changes > 0;
  } catch (error) {
    console.error('[auth-token-store] Failed to update token status:', error);
    return false;
  }
}

/**
 * Get all active tokens for a given user across all providers.
 */
export function getActiveTokensForUser(userId: string): StoredProviderToken[] {
  if (!isTokenEncryptionAvailable()) {
    return [];
  }

  try {
    const db = getAuthDb();
    const rows = db
      .prepare(
        `SELECT * FROM user_tokens WHERE user_id = ? AND status = 'active'`
      )
      .all(userId) as TokenRow[];

    const tokens: StoredProviderToken[] = [];
    for (const row of rows) {
      const token = rowToStoredToken(row);
      if (token) {
        tokens.push(token);
      }
    }
    return tokens;
  } catch (error) {
    console.error('[auth-token-store] Failed to get active tokens for user:', error);
    return [];
  }
}

/**
 * Get all active tokens across all users and providers.
 * Used by the token keepalive loop to proactively refresh expiring tokens.
 */
export function getAllActiveTokens(): StoredProviderToken[] {
  if (!isTokenEncryptionAvailable()) {
    return [];
  }

  try {
    const db = getAuthDb();
    const rows = db
      .prepare(`SELECT * FROM user_tokens WHERE status = 'active'`)
      .all() as TokenRow[];

    const tokens: StoredProviderToken[] = [];
    for (const row of rows) {
      const token = rowToStoredToken(row);
      if (token) {
        tokens.push(token);
      }
    }
    return tokens;
  } catch (error) {
    console.error('[auth-token-store] Failed to get all active tokens:', error);
    return [];
  }
}

/**
 * Find the user_id that has an active token for a given provider.
 *
 * In multi-provider setups, each provider may store tokens under a
 * different user_id (e.g. Spotify username vs TIDAL numeric ID).
 * This helper resolves the correct user_id for background operations
 * that need to call createBackgroundProvider().
 */
export function findUserIdForProvider(provider: MusicProviderId): string | null {
  if (!isTokenEncryptionAvailable()) {
    return null;
  }

  try {
    const db = getAuthDb();
    const row = db
      .prepare(
        `SELECT user_id FROM user_tokens WHERE provider = ? AND status = 'active' LIMIT 1`
      )
      .get(provider) as { user_id: string } | undefined;

    return row?.user_id ?? null;
  } catch (error) {
    console.error('[auth-token-store] Failed to find userId for provider:', error);
    return null;
  }
}
