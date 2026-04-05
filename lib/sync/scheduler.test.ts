/**
 * Unit tests for the background sync scheduler.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SyncPair } from '@/lib/sync/types';

vi.mock('@/lib/sync/syncStore', () => ({
  getDueSyncPairs: vi.fn(),
}));

vi.mock('@/lib/sync/executor', () => ({
  executeSyncPair: vi.fn(),
}));

import { getDueSyncPairs } from '@/lib/sync/syncStore';
import { executeSyncPair } from '@/lib/sync/executor';
import { startScheduler, stopScheduler } from '@/lib/sync/scheduler';

const mockedGetDueSyncPairs = vi.mocked(getDueSyncPairs);
const mockedExecuteSyncPair = vi.mocked(executeSyncPair);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPair(id: string): SyncPair {
  return {
    id,
    sourceProvider: 'spotify',
    sourcePlaylistId: 'src-' + id,
    sourcePlaylistName: 'Source ' + id,
    targetProvider: 'tidal',
    targetPlaylistId: 'tgt-' + id,
    targetPlaylistName: 'Target ' + id,
    direction: 'a-to-b',
    createdBy: 'user-1',
    providerUserIds: {},
    autoSync: true,
    syncInterval: '1h',
    nextRunAt: new Date().toISOString(),
    consecutiveFailures: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Creates a deferred promise — allows the test to control when a mock
 * executeSyncPair call resolves or rejects.
 */
function createDeferred(): { promise: Promise<string>; resolve: () => void; reject: (err: Error) => void } {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = () => res('run-id');
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();

  // Save env vars we may mutate
  savedEnv.SYNC_SCHEDULER_ENABLED = process.env.SYNC_SCHEDULER_ENABLED;
  savedEnv.SYNC_TICK_MS = process.env.SYNC_TICK_MS;
  savedEnv.SYNC_MAX_CONCURRENT = process.env.SYNC_MAX_CONCURRENT;

  // Default mock: no due pairs, instant resolve
  mockedGetDueSyncPairs.mockReturnValue([]);
  mockedExecuteSyncPair.mockResolvedValue('run-id');
});

afterEach(() => {
  stopScheduler();
  vi.useRealTimers();

  // Restore env vars
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scheduler', () => {
  // -------------------------------------------------------------------------
  // startScheduler
  // -------------------------------------------------------------------------

  describe('startScheduler', () => {
    it('does nothing when SYNC_SCHEDULER_ENABLED is not true', () => {
      delete process.env.SYNC_SCHEDULER_ENABLED;

      startScheduler();

      expect(mockedGetDueSyncPairs).not.toHaveBeenCalled();
    });

    it('does nothing when SYNC_SCHEDULER_ENABLED is false', () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'false';

      startScheduler();

      expect(mockedGetDueSyncPairs).not.toHaveBeenCalled();
    });

    it('runs an initial tick when enabled', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      const pair = createPair('p1');
      mockedGetDueSyncPairs.mockReturnValue([pair]);

      startScheduler();
      // Allow the microtask from `void tick()` to flush
      await vi.advanceTimersByTimeAsync(0);

      expect(mockedGetDueSyncPairs).toHaveBeenCalledTimes(1);
      expect(mockedExecuteSyncPair).toHaveBeenCalledWith({ pair, triggeredBy: 'scheduler' });
    });

    it('is idempotent — calling twice does not create duplicate timers', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';

      startScheduler();
      startScheduler();

      await vi.advanceTimersByTimeAsync(0);

      // Initial tick fires once, not twice
      expect(mockedGetDueSyncPairs).toHaveBeenCalledTimes(1);

      // After one full tick interval, only one scheduled tick fires
      mockedGetDueSyncPairs.mockClear();
      await vi.advanceTimersByTimeAsync(70_000);

      expect(mockedGetDueSyncPairs).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // stopScheduler
  // -------------------------------------------------------------------------

  describe('stopScheduler', () => {
    it('stops the scheduled tick from firing', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      mockedGetDueSyncPairs.mockClear();
      stopScheduler();

      // Advance well past the tick interval
      await vi.advanceTimersByTimeAsync(200_000);

      expect(mockedGetDueSyncPairs).not.toHaveBeenCalled();
    });

    it('is safe to call when the scheduler was never started', () => {
      expect(() => stopScheduler()).not.toThrow();
    });

    it('is safe to call twice', () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      startScheduler();
      stopScheduler();
      expect(() => stopScheduler()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Tick behavior
  // -------------------------------------------------------------------------

  describe('tick behavior', () => {
    it('fetches due pairs and dispatches them to executeSyncPair', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      const pairs = [createPair('a'), createPair('b')];
      mockedGetDueSyncPairs.mockReturnValue(pairs);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockedGetDueSyncPairs).toHaveBeenCalledWith(2); // default max concurrent
      expect(mockedExecuteSyncPair).toHaveBeenCalledTimes(2);
      expect(mockedExecuteSyncPair).toHaveBeenCalledWith({ pair: pairs[0], triggeredBy: 'scheduler' });
      expect(mockedExecuteSyncPair).toHaveBeenCalledWith({ pair: pairs[1], triggeredBy: 'scheduler' });
    });

    it('handles zero due pairs gracefully', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      mockedGetDueSyncPairs.mockReturnValue([]);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockedGetDueSyncPairs).toHaveBeenCalledTimes(1);
      expect(mockedExecuteSyncPair).not.toHaveBeenCalled();
    });

    it('re-ticks after the scheduled delay', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockedGetDueSyncPairs).toHaveBeenCalledTimes(1);

      // Advance past the tick interval (with jitter, max is 60000 * 1.05 = 63000)
      mockedGetDueSyncPairs.mockClear();
      await vi.advanceTimersByTimeAsync(70_000);

      expect(mockedGetDueSyncPairs).toHaveBeenCalled();
    });

    it('continues scheduling even after a tick with no due pairs', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      mockedGetDueSyncPairs.mockReturnValue([]);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      // First tick done — scheduler should schedule next tick
      mockedGetDueSyncPairs.mockClear();
      await vi.advanceTimersByTimeAsync(70_000);

      expect(mockedGetDueSyncPairs).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Concurrency
  // -------------------------------------------------------------------------

  describe('concurrency', () => {
    it('respects MAX_CONCURRENT limit — does not dispatch more than available slots', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      process.env.SYNC_MAX_CONCURRENT = '2';

      const deferred1 = createDeferred();
      const deferred2 = createDeferred();
      mockedExecuteSyncPair
        .mockReturnValueOnce(deferred1.promise)
        .mockReturnValueOnce(deferred2.promise);
      mockedGetDueSyncPairs.mockReturnValue([createPair('a'), createPair('b')]);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      // Both slots taken
      expect(mockedExecuteSyncPair).toHaveBeenCalledTimes(2);

      // Next tick: all slots occupied, should request 0 pairs and skip
      mockedGetDueSyncPairs.mockClear();
      mockedExecuteSyncPair.mockClear();

      await vi.advanceTimersByTimeAsync(70_000);

      // tick() returns early because activeSyncs >= maxConcurrent
      expect(mockedExecuteSyncPair).not.toHaveBeenCalled();

      // Resolve both to clean up activeSyncs
      deferred1.resolve();
      deferred2.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    it('opens slots as syncs complete', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      process.env.SYNC_MAX_CONCURRENT = '1';

      const deferred = createDeferred();
      mockedExecuteSyncPair.mockReturnValueOnce(deferred.promise);
      mockedGetDueSyncPairs.mockReturnValue([createPair('a')]);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockedExecuteSyncPair).toHaveBeenCalledTimes(1);

      // Resolve the sync
      deferred.resolve();
      await vi.advanceTimersByTimeAsync(0);

      // Next tick — slot is free again
      mockedGetDueSyncPairs.mockClear();
      mockedExecuteSyncPair.mockClear();
      mockedGetDueSyncPairs.mockReturnValue([createPair('b')]);
      mockedExecuteSyncPair.mockResolvedValue('run-id');

      await vi.advanceTimersByTimeAsync(70_000);

      expect(mockedGetDueSyncPairs).toHaveBeenCalledWith(1);
      expect(mockedExecuteSyncPair).toHaveBeenCalledTimes(1);
    });

    it('decrements activeSyncs when a sync fails', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      process.env.SYNC_MAX_CONCURRENT = '1';

      const deferred = createDeferred();
      mockedExecuteSyncPair.mockReturnValueOnce(deferred.promise);
      mockedGetDueSyncPairs.mockReturnValue([createPair('a')]);

      // Suppress the console.error from the .catch handler
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockedExecuteSyncPair).toHaveBeenCalledTimes(1);

      // Reject the sync — activeSyncs should still decrement via .finally()
      deferred.reject(new Error('sync failed'));
      await vi.advanceTimersByTimeAsync(0);

      // Next tick — slot should be free again
      mockedGetDueSyncPairs.mockClear();
      mockedExecuteSyncPair.mockClear();
      mockedGetDueSyncPairs.mockReturnValue([createPair('b')]);
      mockedExecuteSyncPair.mockResolvedValue('run-id');

      await vi.advanceTimersByTimeAsync(70_000);

      expect(mockedExecuteSyncPair).toHaveBeenCalledTimes(1);

      errorSpy.mockRestore();
    });

    it('requests only available slots from getDueSyncPairs', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      process.env.SYNC_MAX_CONCURRENT = '3';

      const deferred = createDeferred();
      mockedExecuteSyncPair.mockReturnValueOnce(deferred.promise);
      mockedGetDueSyncPairs.mockReturnValue([createPair('a')]);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      // 1 active sync, max 3 -> 2 slots available on next tick
      mockedGetDueSyncPairs.mockClear();
      mockedGetDueSyncPairs.mockReturnValue([]);

      await vi.advanceTimersByTimeAsync(70_000);

      expect(mockedGetDueSyncPairs).toHaveBeenCalledWith(2);

      deferred.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  // -------------------------------------------------------------------------
  // Env configuration
  // -------------------------------------------------------------------------

  describe('env configuration', () => {
    it('uses default SYNC_TICK_MS of 60000', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      delete process.env.SYNC_TICK_MS;

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      mockedGetDueSyncPairs.mockClear();

      // At 55s (below 60s minus jitter floor), no tick should fire
      await vi.advanceTimersByTimeAsync(55_000);
      expect(mockedGetDueSyncPairs).not.toHaveBeenCalled();

      // At 65s total (above 60s + jitter ceiling), tick should have fired
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mockedGetDueSyncPairs).toHaveBeenCalled();
    });

    it('reads SYNC_TICK_MS from env', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      process.env.SYNC_TICK_MS = '5000';

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      mockedGetDueSyncPairs.mockClear();

      // 5000ms with 5% jitter means delay is between 4750 and 5250,
      // but floored at 1000. So by 6000ms it should definitely fire.
      await vi.advanceTimersByTimeAsync(6_000);
      expect(mockedGetDueSyncPairs).toHaveBeenCalled();
    });

    it('uses default SYNC_MAX_CONCURRENT of 2', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      delete process.env.SYNC_MAX_CONCURRENT;

      mockedGetDueSyncPairs.mockReturnValue([]);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      // With 0 active syncs and max 2, should request 2 slots
      expect(mockedGetDueSyncPairs).toHaveBeenCalledWith(2);
    });

    it('reads SYNC_MAX_CONCURRENT from env', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      process.env.SYNC_MAX_CONCURRENT = '5';

      mockedGetDueSyncPairs.mockReturnValue([]);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockedGetDueSyncPairs).toHaveBeenCalledWith(5);
    });
  });

  // -------------------------------------------------------------------------
  // Jitter
  // -------------------------------------------------------------------------

  describe('jitter', () => {
    it('applies jitter so scheduled delay is not exactly TICK_MS', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      process.env.SYNC_TICK_MS = '10000';

      // Seed Math.random to produce a non-zero jitter
      // jitteredDelay formula: baseMs + baseMs * 0.05 * (2 * random - 1)
      // With random = 0, jitter = 10000 * 0.05 * -1 = -500 => delay = 9500
      // With random = 1, jitter = 10000 * 0.05 * 1 = 500 => delay = 10500
      const randomSpy = vi.spyOn(Math, 'random');

      // First call to jitteredDelay uses Math.random
      // Return 0 to get minimum jitter (delay = 9500)
      randomSpy.mockReturnValue(0);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      mockedGetDueSyncPairs.mockClear();

      // At exactly 10000ms the tick should already have fired (delay was 9500)
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mockedGetDueSyncPairs).toHaveBeenCalledTimes(1);

      // Reset and test with random=1 (delay = 10500)
      stopScheduler();
      mockedGetDueSyncPairs.mockClear();
      randomSpy.mockReturnValue(1);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);
      mockedGetDueSyncPairs.mockClear();

      // At 10000ms the tick should NOT have fired yet (delay is 10500)
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mockedGetDueSyncPairs).not.toHaveBeenCalled();

      // At 11000ms it should have fired
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mockedGetDueSyncPairs).toHaveBeenCalledTimes(1);

      randomSpy.mockRestore();
    });

    it('floors jittered delay at 1 second', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      process.env.SYNC_TICK_MS = '100'; // Very small tick

      // With random = 0: jitter = 100 * 0.05 * -1 = -5 => delay = 95
      // Floored at 1000
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      mockedGetDueSyncPairs.mockClear();

      // Before 1000ms, nothing should fire
      await vi.advanceTimersByTimeAsync(999);
      expect(mockedGetDueSyncPairs).not.toHaveBeenCalled();

      // At 1000ms, the floored delay fires
      await vi.advanceTimersByTimeAsync(1);
      expect(mockedGetDueSyncPairs).toHaveBeenCalledTimes(1);

      randomSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling in tick
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('logs to console.error when executeSyncPair rejects', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockedGetDueSyncPairs.mockReturnValue([createPair('fail')]);
      mockedExecuteSyncPair.mockRejectedValue(new Error('boom'));

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      expect(errorSpy).toHaveBeenCalledWith(
        '[sync/scheduler] unhandled',
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });

    it('continues scheduling ticks after a sync error', async () => {
      process.env.SYNC_SCHEDULER_ENABLED = 'true';
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockedGetDueSyncPairs.mockReturnValue([createPair('fail')]);
      mockedExecuteSyncPair.mockRejectedValue(new Error('boom'));

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      // Clear and check next tick still fires
      mockedGetDueSyncPairs.mockClear();
      mockedGetDueSyncPairs.mockReturnValue([]);
      await vi.advanceTimersByTimeAsync(70_000);

      expect(mockedGetDueSyncPairs).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });
});
