import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isRefreshBlocked,
  recordPermanentFailure,
  resetCircuitBreaker,
  getCircuitState,
  _resetAllCircuitBreakers,
  CIRCUIT_BREAKER_COOLDOWN_MS,
} from '@/lib/auth/refreshCircuitBreaker';

const ALICE = 'spotify:alice';
const BOB = 'spotify:bob';

describe('refreshCircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetAllCircuitBreakers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when no failure has been recorded', () => {
    expect(isRefreshBlocked('spotify', ALICE)).toBe(false);
  });

  it('blocks the user after recordPermanentFailure', () => {
    recordPermanentFailure('spotify', ALICE, 'invalid_grant');
    expect(isRefreshBlocked('spotify', ALICE)).toBe(true);
  });

  it('records failure state with timestamp and reason', () => {
    recordPermanentFailure('spotify', ALICE, 'invalid_grant');
    const state = getCircuitState('spotify', ALICE);
    expect(state).not.toBeNull();
    expect(state!.reason).toBe('invalid_grant');
    expect(state!.failedAt).toBe(Date.now());
  });

  it('does not block other users of the same provider', () => {
    recordPermanentFailure('spotify', ALICE, 'invalid_grant');
    expect(isRefreshBlocked('spotify', ALICE)).toBe(true);
    expect(isRefreshBlocked('spotify', BOB)).toBe(false);
  });

  it('does not block the same user on another provider', () => {
    recordPermanentFailure('spotify', ALICE, 'invalid_grant');
    expect(isRefreshBlocked('tidal', ALICE)).toBe(false);
  });

  it('unblocks after cooldown elapses', () => {
    recordPermanentFailure('spotify', ALICE, 'invalid_grant');
    expect(isRefreshBlocked('spotify', ALICE)).toBe(true);

    vi.advanceTimersByTime(CIRCUIT_BREAKER_COOLDOWN_MS);
    expect(isRefreshBlocked('spotify', ALICE)).toBe(false);
  });

  it('clears state after cooldown so next check is clean', () => {
    recordPermanentFailure('spotify', ALICE, 'invalid_grant');
    vi.advanceTimersByTime(CIRCUIT_BREAKER_COOLDOWN_MS);
    isRefreshBlocked('spotify', ALICE); // triggers auto-clear
    expect(getCircuitState('spotify', ALICE)).toBeNull();
  });

  it('prunes expired entries of other users when recording a new failure', () => {
    recordPermanentFailure('spotify', ALICE, 'invalid_grant');
    vi.advanceTimersByTime(CIRCUIT_BREAKER_COOLDOWN_MS);
    recordPermanentFailure('spotify', BOB, 'invalid_grant');
    expect(getCircuitState('spotify', ALICE)).toBeNull();
    expect(getCircuitState('spotify', BOB)).not.toBeNull();
  });

  it('resetCircuitBreaker clears only that user', () => {
    recordPermanentFailure('spotify', ALICE, 'invalid_grant');
    recordPermanentFailure('spotify', BOB, 'invalid_grant');

    resetCircuitBreaker('spotify', ALICE);
    expect(isRefreshBlocked('spotify', ALICE)).toBe(false);
    expect(isRefreshBlocked('spotify', BOB)).toBe(true);
  });

  it('overwrites previous failure on repeated recordPermanentFailure', () => {
    recordPermanentFailure('spotify', ALICE, 'first_reason');
    vi.advanceTimersByTime(1000);
    recordPermanentFailure('spotify', ALICE, 'second_reason');

    const state = getCircuitState('spotify', ALICE);
    expect(state!.reason).toBe('second_reason');
    expect(state!.failedAt).toBe(Date.now());
    expect(isRefreshBlocked('spotify', ALICE)).toBe(true);
  });

  it('is a no-op without a user id', () => {
    recordPermanentFailure('spotify', undefined, 'invalid_grant');
    expect(isRefreshBlocked('spotify', undefined)).toBe(false);
    expect(isRefreshBlocked('spotify', ALICE)).toBe(false);
    expect(() => resetCircuitBreaker('spotify', undefined)).not.toThrow();
  });
});
