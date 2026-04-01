/**
 * Per-provider circuit breaker for token refresh.
 *
 * When a provider returns a permanent failure (e.g. `invalid_grant`), the
 * circuit opens and all subsequent refresh attempts are blocked for a
 * cooldown period. This prevents retry storms when a token is revoked.
 *
 * The circuit is reset when the user re-authenticates (account present in
 * JWT callback) or when the cooldown elapses (allowing one retry).
 */

import type { MusicProviderId } from '@/lib/music-provider/types';

export const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

type CircuitState = {
  failedAt: number;
  reason: string;
};

const circuitState = new Map<MusicProviderId, CircuitState>();

export function isRefreshBlocked(
  provider: MusicProviderId,
  nowMs = Date.now(),
): boolean {
  const state = circuitState.get(provider);
  if (!state) return false;

  if (nowMs - state.failedAt >= CIRCUIT_BREAKER_COOLDOWN_MS) {
    circuitState.delete(provider);
    return false;
  }

  return true;
}

export function recordPermanentFailure(
  provider: MusicProviderId,
  reason: string,
): void {
  circuitState.set(provider, { failedAt: Date.now(), reason });
}

export function resetCircuitBreaker(provider: MusicProviderId): void {
  circuitState.delete(provider);
}

export function getCircuitState(provider: MusicProviderId): CircuitState | null {
  return circuitState.get(provider) ?? null;
}

/** @internal — test-only helper */
export function _resetAllCircuitBreakers(): void {
  circuitState.clear();
}
