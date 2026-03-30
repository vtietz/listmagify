/**
 * Token keepalive loop for proactive provider token refresh.
 *
 * Periodically scans all active tokens in the database and refreshes
 * those expiring soon, so background sync always finds valid tokens
 * without relying on web traffic or browser sessions.
 *
 * Configurable via env:
 *   TOKEN_KEEPALIVE_INTERVAL_MS  — scan interval (default 30min)
 *   TOKEN_KEEPALIVE_AHEAD_MS     — refresh threshold (default 15min)
 */

import { getAllActiveTokens, persistProviderTokens, markTokenStatus } from './tokenStore';
import type { StoredProviderToken } from './tokenStore';
import {
  refreshSpotifyAccessToken,
  refreshTidalAccessToken,
  TOKEN_REFRESH_ERROR,
  type ProviderJwtToken,
} from './tokenRefresh';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_AHEAD_MS = 15 * 60 * 1000;

function getIntervalMs(): number {
  return Number(process.env.TOKEN_KEEPALIVE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
}

function getAheadMs(): number {
  return Number(process.env.TOKEN_KEEPALIVE_AHEAD_MS ?? DEFAULT_AHEAD_MS);
}

let timeoutId: ReturnType<typeof setTimeout> | null = null;

function isExpiringSoon(token: StoredProviderToken): boolean {
  if (typeof token.accessTokenExpires !== 'number') return false;
  return token.accessTokenExpires - Date.now() < getAheadMs();
}

function storedTokenToJwt(stored: StoredProviderToken): ProviderJwtToken {
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

function buildPersistParams(
  original: StoredProviderToken,
  refreshed: ProviderJwtToken,
): Parameters<typeof persistProviderTokens>[0] {
  return {
    userId: original.userId,
    provider: original.provider,
    accessToken: refreshed.accessToken ?? '',
    refreshToken: refreshed.refreshToken ?? original.refreshToken,
    accessTokenExpires: refreshed.accessTokenExpires ?? null,
    isByok: refreshed.isByok ?? false,
    byokClientId: refreshed.byok?.clientId ?? original.byokClientId ?? null,
    byokClientSecret: refreshed.byok?.clientSecret ?? original.byokClientSecret ?? null,
  };
}

function isTokenUnchanged(original: StoredProviderToken, refreshed: ProviderJwtToken): boolean {
  return refreshed.accessToken === original.accessToken
    && refreshed.accessTokenExpires === original.accessTokenExpires;
}

async function refreshSingleToken(token: StoredProviderToken): Promise<void> {
  const jwtToken = storedTokenToJwt(token);

  const refreshed = token.provider === 'spotify'
    ? await refreshSpotifyAccessToken(jwtToken)
    : await refreshTidalAccessToken(jwtToken);

  // Permanent auth failure
  if (refreshed.error === TOKEN_REFRESH_ERROR) {
    console.warn(`[token-keepalive] permanent auth error for ${token.provider}/${token.userId}, marking needs_reauth`);
    markTokenStatus(token.userId, token.provider, 'needs_reauth');
    return;
  }

  // Transient failure — token returned unchanged
  if (isTokenUnchanged(token, refreshed)) {
    console.debug(`[token-keepalive] transient failure or no change for ${token.provider}/${token.userId}, skipping`);
    return;
  }

  // Persist refreshed token
  persistProviderTokens(buildPersistParams(token, refreshed));

  console.debug(`[token-keepalive] refreshed ${token.provider}/${token.userId}`);
}

async function runKeepalivePass(): Promise<void> {
  const tokens = getAllActiveTokens();
  const expiring = tokens.filter(isExpiringSoon);

  if (expiring.length === 0) {
    console.debug(`[token-keepalive] no tokens expiring soon (checked ${tokens.length})`);
    return;
  }

  console.debug(`[token-keepalive] ${expiring.length}/${tokens.length} tokens expiring soon`);

  for (const token of expiring) {
    try {
      await refreshSingleToken(token);
    } catch (error) {
      console.error(`[token-keepalive] unexpected error refreshing ${token.provider}/${token.userId}`, error);
    }
  }
}

function scheduleNext(): void {
  const delay = getIntervalMs();
  timeoutId = setTimeout(() => {
    void runKeepalivePass().finally(scheduleNext);
  }, delay);
}

export function startTokenKeepaliveLoop(): void {
  if (timeoutId) return;
  console.debug('[token-keepalive] starting', {
    intervalMs: getIntervalMs(),
    aheadMs: getAheadMs(),
  });
  void runKeepalivePass();
  scheduleNext();
}

export function stopTokenKeepaliveLoop(): void {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}
