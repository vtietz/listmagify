/**
 * Server-side session reconstruction from DB-stored tokens.
 *
 * Reads provider tokens from the database, refreshes them when expired,
 * and returns an AuthenticatedSession — bypassing the NextAuth JWT flow.
 *
 * This is used for background jobs and server-side operations that need
 * a valid access token but don't have a browser session.
 */

import type { MusicProviderId } from '@/lib/music-provider/types';
import type { AuthenticatedSession } from '@/lib/auth/requireAuth';
import {
  getProviderTokens,
  getProviderTokensByProvider,
  persistProviderTokens,
  markTokenStatus,
  type StoredProviderToken,
} from '@/lib/auth/tokenStore';
import {
  REFRESH_BUFFER_MS,
  refreshSpotifyAccessToken,
  refreshTidalAccessToken,
  type ProviderJwtToken,
} from '@/lib/auth/tokenRefresh';
import { isRefreshBlocked, recordPermanentFailure } from '@/lib/auth/refreshCircuitBreaker';

// ---------------------------------------------------------------------------
// Single-flight guard — prevents concurrent refreshes for the same
// user+provider pair.
// ---------------------------------------------------------------------------

const refreshInFlight = new Map<string, Promise<AuthenticatedSession | null>>();

export async function getSessionFromDb(
  userId: string,
  providerId: MusicProviderId,
): Promise<AuthenticatedSession | null> {
  const key = `${userId}:${providerId}`;

  const existing = refreshInFlight.get(key);
  if (existing) return existing;

  const promise = getSessionFromDbInner(userId, providerId).finally(() => {
    refreshInFlight.delete(key);
  });

  refreshInFlight.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildSessionFromStored(
  userId: string,
  providerId: MusicProviderId,
  stored: StoredProviderToken,
): AuthenticatedSession {
  return {
    user: { id: userId },
    accessToken: stored.accessToken,
    ...(typeof stored.accessTokenExpires === 'number' ? { accessTokenExpires: stored.accessTokenExpires } : {}),
    providerId,
  };
}

function buildSessionFromRefreshed(
  userId: string,
  providerId: MusicProviderId,
  refreshed: ProviderJwtToken,
): AuthenticatedSession | null {
  if (!refreshed.accessToken) {
    return null;
  }

  return {
    user: { id: userId },
    accessToken: refreshed.accessToken,
    ...(typeof refreshed.accessTokenExpires === 'number' ? { accessTokenExpires: refreshed.accessTokenExpires } : {}),
    providerId,
  };
}

function storedTokenToProviderJwtToken(stored: StoredProviderToken): ProviderJwtToken {
  return {
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    ...(typeof stored.accessTokenExpires === 'number' ? { accessTokenExpires: stored.accessTokenExpires } : {}),
    ...(stored.isByok ? { isByok: true } : {}),
    ...(stored.byokClientId && stored.byokClientSecret
      ? { byok: { clientId: stored.byokClientId, clientSecret: stored.byokClientSecret } }
      : {}),
  };
}

function isRevocationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('revoked') || message.includes('invalid_grant');
}

function safePersistTokens(
  userId: string,
  providerId: MusicProviderId,
  stored: StoredProviderToken,
  refreshed: ProviderJwtToken,
): void {
  try {
    persistProviderTokens({
      userId,
      provider: providerId,
      accessToken: refreshed.accessToken ?? '',
      refreshToken: refreshed.refreshToken ?? stored.refreshToken,
      accessTokenExpires: refreshed.accessTokenExpires ?? null,
      isByok: refreshed.isByok ?? false,
      byokClientId: refreshed.byok?.clientId ?? stored.byokClientId ?? null,
      byokClientSecret: refreshed.byok?.clientSecret ?? stored.byokClientSecret ?? null,
    });
  } catch (error) {
    console.error(`[sessionFromDb] Failed to persist refreshed tokens for ${providerId}, user=${userId}`, error);
  }
}

function safeMarkStatus(
  userId: string,
  providerId: MusicProviderId,
  status: 'revoked' | 'needs_reauth',
): void {
  try {
    markTokenStatus(userId, providerId, status);
  } catch (error) {
    console.error(`[sessionFromDb] Failed to mark token status '${status}' for ${providerId}, user=${userId}`, error);
  }
}

function tokenIsStillFresh(stored: StoredProviderToken): boolean {
  if (typeof stored.accessTokenExpires !== 'number') {
    return false;
  }

  return Date.now() < stored.accessTokenExpires - REFRESH_BUFFER_MS;
}

async function refreshAndPersist(
  userId: string,
  providerId: MusicProviderId,
  stored: StoredProviderToken,
): Promise<AuthenticatedSession | null> {
  if (isRefreshBlocked(providerId)) {
    return null;
  }

  const jwtToken = storedTokenToProviderJwtToken(stored);

  try {
    const refreshed = providerId === 'spotify'
      ? await refreshSpotifyAccessToken(jwtToken)
      : await refreshTidalAccessToken(jwtToken);

    if (refreshed.error) {
      recordPermanentFailure(providerId, 'refresh_error');
      console.debug(`[sessionFromDb] Token refresh returned error for ${providerId}, user=${userId}`);
      safeMarkStatus(userId, providerId, 'needs_reauth');
      return null;
    }

    safePersistTokens(userId, providerId, stored, refreshed);
    return buildSessionFromRefreshed(userId, providerId, refreshed);
  } catch (error) {
    if (isRevocationError(error)) {
      console.debug(`[sessionFromDb] Token revoked for ${providerId}, user=${userId}`);
      safeMarkStatus(userId, providerId, 'revoked');
      return null;
    }

    console.debug(`[sessionFromDb] Token refresh failed for ${providerId}, user=${userId}`, error);
    safeMarkStatus(userId, providerId, 'needs_reauth');
    return null;
  }
}

async function getSessionFromDbInner(
  userId: string,
  providerId: MusicProviderId,
): Promise<AuthenticatedSession | null> {
  let stored: StoredProviderToken | null;

  try {
    stored = getProviderTokens(userId, providerId);
  } catch (error) {
    console.error(`[sessionFromDb] Failed to read tokens from DB for ${providerId}, user=${userId}`, error);
    return null;
  }

  // Fallback: if no token found for this userId, try finding any active
  // token for this provider. This handles the case where multi-provider
  // auth stores tokens under different user IDs (e.g. Spotify username
  // vs TIDAL numeric ID).
  if (!stored) {
    try {
      stored = getProviderTokensByProvider(providerId);
      if (stored) {
        console.debug(`[sessionFromDb] Fallback: found ${providerId} token under different userId`);
      }
    } catch {
      // Ignore fallback errors
    }
  }

  if (!stored) {
    return null;
  }

  // Token is still fresh — return session directly
  if (tokenIsStillFresh(stored)) {
    return buildSessionFromStored(userId, providerId, stored);
  }

  // Token expired or expiring — attempt refresh
  return refreshAndPersist(userId, providerId, stored);
}
