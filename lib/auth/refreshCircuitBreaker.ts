/**
 * Per-user, per-provider circuit breaker for token refresh.
 *
 * When a provider returns a permanent failure (e.g. `invalid_grant`) for a
 * user's refresh token, the circuit for that user+provider opens and further
 * refresh attempts for that pair are blocked for a cooldown period. This
 * prevents retry storms when a token is revoked, without affecting other
 * users of the same provider.
 *
 * The circuit is reset when the user re-authenticates (account present in
 * JWT callback) or when the cooldown elapses (allowing one retry).
 *
 * A missing userId means the caller cannot attribute the failure to a user;
 * the breaker then does nothing (never blocks, never records).
 */

import type { MusicProviderId } from '@/lib/music-provider/types';

export const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

type CircuitState = {
  failedAt: number;
  reason: string;
};

const circuitState = new Map<string, CircuitState>();

function circuitKey(provider: MusicProviderId, userId: string): string {
  return `${provider}|${userId}`;
}

function isExpired(state: CircuitState, nowMs: number): boolean {
  return nowMs - state.failedAt >= CIRCUIT_BREAKER_COOLDOWN_MS;
}

/** Drops expired entries so the map doesn't grow with every user that ever failed. */
function pruneExpired(nowMs: number): void {
  for (const [key, state] of circuitState) {
    if (isExpired(state, nowMs)) circuitState.delete(key);
  }
}

export function isRefreshBlocked(
  provider: MusicProviderId,
  userId: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!userId) return false;

  const key = circuitKey(provider, userId);
  const state = circuitState.get(key);
  if (!state) return false;

  if (isExpired(state, nowMs)) {
    circuitState.delete(key);
    return false;
  }

  return true;
}

export function recordPermanentFailure(
  provider: MusicProviderId,
  userId: string | undefined,
  reason: string,
): void {
  if (!userId) return;

  const now = Date.now();
  pruneExpired(now);
  circuitState.set(circuitKey(provider, userId), { failedAt: now, reason });
}

export function resetCircuitBreaker(provider: MusicProviderId, userId: string | undefined): void {
  if (!userId) return;
  circuitState.delete(circuitKey(provider, userId));
}

export function getCircuitState(provider: MusicProviderId, userId: string): CircuitState | null {
  return circuitState.get(circuitKey(provider, userId)) ?? null;
}

/** @internal — test-only helper */
export function _resetAllCircuitBreakers(): void {
  circuitState.clear();
}
