/**
 * Token keepalive loop for proactive provider token refresh.
 *
 * Scans all active tokens in the database and refreshes those expiring soon,
 * so background sync always finds valid tokens without relying on web traffic
 * or browser sessions, however rarely a pair syncs. The next scan is timed by
 * the earliest token expiry, so each token is refreshed shortly before it
 * expires, and not more often.
 *
 * Configurable via env:
 *   TOKEN_KEEPALIVE_INTERVAL_MS  — longest wait between scans, to pick up new sign-ins (default 30min)
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
import { isRefreshBlocked, recordPermanentFailure } from './refreshCircuitBreaker';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_AHEAD_MS = 15 * 60 * 1000;
/** Shortest wait between scans, so a refresh that keeps failing is not retried in a tight loop. */
const MIN_DELAY_MS = 2 * 60 * 1000;

function getIntervalMs(): number {
  return Number(process.env.TOKEN_KEEPALIVE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
}

function getAheadMs(): number {
  return Number(process.env.TOKEN_KEEPALIVE_AHEAD_MS ?? DEFAULT_AHEAD_MS);
}

let timeoutId: ReturnType<typeof setTimeout> | null = null;
/** Bumped on every start/stop, so a pass still in flight from a stopped loop schedules nothing. */
let generation = 0;
let running = false;

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

/** Refreshes one token; returns its expiry afterwards (null once it needs re-authentication). */
async function refreshSingleToken(token: StoredProviderToken): Promise<number | null> {
  if (isRefreshBlocked(token.provider)) {
    console.debug(`[token-keepalive] circuit breaker open for ${token.provider}, skipping`);
    return token.accessTokenExpires;
  }

  const jwtToken = storedTokenToJwt(token);

  const refreshed = token.provider === 'spotify'
    ? await refreshSpotifyAccessToken(jwtToken)
    : await refreshTidalAccessToken(jwtToken);

  // Permanent auth failure
  if (refreshed.error === TOKEN_REFRESH_ERROR) {
    recordPermanentFailure(token.provider, 'invalid_grant');
    console.warn(`[token-keepalive] permanent auth error for ${token.provider}, marking needs_reauth`);
    markTokenStatus(token.userId, token.provider, 'needs_reauth');
    return null;
  }

  // Transient failure — token returned unchanged
  if (isTokenUnchanged(token, refreshed)) {
    console.debug(`[token-keepalive] transient failure or no change for ${token.provider}, skipping`);
    return token.accessTokenExpires;
  }

  // Persist refreshed token
  persistProviderTokens(buildPersistParams(token, refreshed));

  console.debug(`[token-keepalive] refreshed 1 ${token.provider} token`);
  return refreshed.accessTokenExpires ?? null;
}

/** Wait until the earliest token is due for a refresh, bounded by the scan interval. */
export function computeNextDelayMs(expiries: ReadonlyArray<number | null>, now = Date.now()): number {
  const maxDelay = Math.max(MIN_DELAY_MS, getIntervalMs());
  const dueIn = expiries
    .filter((expires): expires is number => typeof expires === 'number')
    .map((expires) => expires - getAheadMs() - now);

  if (dueIn.length === 0) return maxDelay;
  return Math.min(maxDelay, Math.max(MIN_DELAY_MS, Math.min(...dueIn)));
}

/** Refreshes tokens expiring soon; returns how long to wait until the next pass. */
async function runKeepalivePass(): Promise<number> {
  const tokens = getAllActiveTokens();
  const expiring = tokens.filter(isExpiringSoon);
  const expiries = tokens.filter((token) => !isExpiringSoon(token)).map((token) => token.accessTokenExpires);

  if (expiring.length === 0) {
    console.debug(`[token-keepalive] no tokens expiring soon (checked ${tokens.length})`);
    return computeNextDelayMs(expiries);
  }

  console.debug(`[token-keepalive] ${expiring.length}/${tokens.length} tokens expiring soon`);

  for (const token of expiring) {
    try {
      expiries.push(await refreshSingleToken(token));
    } catch (error) {
      console.error(`[token-keepalive] unexpected error refreshing ${token.provider} token`, error);
      expiries.push(token.accessTokenExpires);
    }
  }

  return computeNextDelayMs(expiries);
}

async function runPassSafely(): Promise<number> {
  try {
    return await runKeepalivePass();
  } catch (error) {
    console.error('[token-keepalive] pass failed', error);
    return getIntervalMs();
  }
}

function runLoop(loopGeneration: number): void {
  void runPassSafely().then((delay) => {
    if (!running || loopGeneration !== generation) return;
    console.debug(`[token-keepalive] next pass in ${Math.round(delay / 1000)}s`);
    timeoutId = setTimeout(() => runLoop(loopGeneration), delay);
  });
}

export function startTokenKeepaliveLoop(): void {
  if (running) return;
  running = true;
  generation += 1;
  console.debug('[token-keepalive] starting', {
    intervalMs: getIntervalMs(),
    aheadMs: getAheadMs(),
  });
  runLoop(generation);
}

export function stopTokenKeepaliveLoop(): void {
  running = false;
  generation += 1;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}
