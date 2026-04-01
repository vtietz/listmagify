import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isRefreshBlocked,
  recordPermanentFailure,
  resetCircuitBreaker,
  getCircuitState,
  _resetAllCircuitBreakers,
  CIRCUIT_BREAKER_COOLDOWN_MS,
} from '@/lib/auth/refreshCircuitBreaker';

describe('refreshCircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetAllCircuitBreakers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when no failure recorded', () => {
    expect(isRefreshBlocked('spotify')).toBe(false);
  });

  it('returns true after recordPermanentFailure', () => {
    recordPermanentFailure('spotify', 'invalid_grant');
    expect(isRefreshBlocked('spotify')).toBe(true);
  });

  it('stores the failure reason', () => {
    recordPermanentFailure('spotify', 'invalid_grant');
    const state = getCircuitState('spotify');
    expect(state).not.toBeNull();
    expect(state!.reason).toBe('invalid_grant');
  });

  it('returns false after cooldown elapses', () => {
    recordPermanentFailure('spotify', 'invalid_grant');
    expect(isRefreshBlocked('spotify')).toBe(true);

    vi.advanceTimersByTime(CIRCUIT_BREAKER_COOLDOWN_MS);
    expect(isRefreshBlocked('spotify')).toBe(false);
  });

  it('clears circuit state after cooldown elapses', () => {
    recordPermanentFailure('spotify', 'invalid_grant');
    vi.advanceTimersByTime(CIRCUIT_BREAKER_COOLDOWN_MS);
    isRefreshBlocked('spotify'); // triggers auto-clear
    expect(getCircuitState('spotify')).toBeNull();
  });

  it('resetCircuitBreaker clears the block immediately', () => {
    recordPermanentFailure('spotify', 'invalid_grant');
    expect(isRefreshBlocked('spotify')).toBe(true);

    resetCircuitBreaker('spotify');
    expect(isRefreshBlocked('spotify')).toBe(false);
    expect(getCircuitState('spotify')).toBeNull();
  });

  it('providers are independent — blocking spotify does not block tidal', () => {
    recordPermanentFailure('spotify', 'invalid_grant');
    expect(isRefreshBlocked('spotify')).toBe(true);
    expect(isRefreshBlocked('tidal')).toBe(false);
  });

  it('resetting one provider does not affect the other', () => {
    recordPermanentFailure('spotify', 'invalid_grant');
    recordPermanentFailure('tidal', 'invalid_grant');

    resetCircuitBreaker('spotify');
    expect(isRefreshBlocked('spotify')).toBe(false);
    expect(isRefreshBlocked('tidal')).toBe(true);
  });

  it('overwrites previous failure on repeated recordPermanentFailure', () => {
    recordPermanentFailure('spotify', 'first_reason');
    vi.advanceTimersByTime(1000);
    recordPermanentFailure('spotify', 'second_reason');

    const state = getCircuitState('spotify');
    expect(state!.reason).toBe('second_reason');
    // Cooldown restarted from latest failure
    vi.advanceTimersByTime(CIRCUIT_BREAKER_COOLDOWN_MS - 1001);
    expect(isRefreshBlocked('spotify')).toBe(true);
  });
});
