/**
 * Account email + re-auth notification state stored next to provider tokens.
 *
 * The email is encrypted at rest like the tokens. `reauth_notified_at` makes
 * the "please sign in again" email a one-shot: it is claimed atomically before
 * sending and cleared by persistProviderTokens once fresh tokens arrive.
 */

import { getAuthDb } from './tokenDb';
import { encryptToken, decryptToken, isTokenEncryptionAvailable } from './tokenEncryption';
import type { MusicProviderId } from '@/lib/music-provider/types';

/** Store (or replace) the account email for an existing token row. */
export function setProviderAccountEmail(userId: string, provider: MusicProviderId, email: string): void {
  if (!isTokenEncryptionAvailable()) return;

  getAuthDb()
    .prepare('UPDATE user_tokens SET email = ? WHERE user_id = ? AND provider = ?')
    .run(encryptToken(email), userId, provider);
}

/** Store the account email only when none is known yet. */
export function setProviderAccountEmailIfMissing(userId: string, provider: MusicProviderId, email: string): void {
  if (!isTokenEncryptionAvailable()) return;

  getAuthDb()
    .prepare('UPDATE user_tokens SET email = ? WHERE user_id = ? AND provider = ? AND email IS NULL')
    .run(encryptToken(email), userId, provider);
}

/**
 * Atomically claim the re-auth notification for a token that is no longer
 * active. Returns the recipient email, or null when there is nothing to send
 * (token still active, already notified, no email, or no row).
 */
export function claimReauthNotification(userId: string, provider: MusicProviderId): string | null {
  if (!isTokenEncryptionAvailable()) return null;

  const row = getAuthDb()
    .prepare(`
      UPDATE user_tokens
      SET reauth_notified_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND provider = ?
        AND status != 'active'
        AND email IS NOT NULL
        AND reauth_notified_at IS NULL
      RETURNING email
    `)
    .get(userId, provider) as { email: string } | undefined;

  if (!row) return null;

  try {
    return decryptToken(row.email);
  } catch (error) {
    console.error('[auth-token-store] Failed to decrypt account email:', error);
    return null;
  }
}

/** Undo a claim when sending failed, so a later sync run can retry. */
export function releaseReauthNotification(userId: string, provider: MusicProviderId): void {
  getAuthDb()
    .prepare('UPDATE user_tokens SET reauth_notified_at = NULL WHERE user_id = ? AND provider = ?')
    .run(userId, provider);
}
