import type { MusicProviderId } from '@/lib/music-provider/types';
import { getTokenStatus } from '@/lib/auth/tokenStore';
import { isTokenEncryptionAvailable } from '@/lib/auth/tokenEncryption';

/**
 * Explain why no DB-backed session could be loaded for a user/provider pair,
 * so background sync failures point at the actual fix.
 */
export function describeMissingSession(userId: string, providerId: MusicProviderId): string {
  if (!isTokenEncryptionAvailable()) {
    return `Token storage not configured for ${providerId} (TOKEN_ENCRYPTION_KEY missing); cannot load session for user=${userId}`;
  }

  const status = getTokenStatus(userId, providerId);
  if (status === 'needs_reauth' || status === 'revoked') {
    return `Re-authentication required for ${providerId}, user=${userId} (token status: ${status})`;
  }

  return `No stored active session for ${providerId}, user=${userId}`;
}
