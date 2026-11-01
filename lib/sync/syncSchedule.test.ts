import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { intervalMs, nextSmartStep, SMART_STEPS_MS } from '@/lib/sync/syncSchedule';
import type { SyncInterval } from '@/lib/sync/types';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const LAST_STEP = SMART_STEPS_MS.length - 1;

describe('smart interval ladder', () => {
  it('goes back to the shortest wait after a change', () => {
    expect(nextSmartStep(5, 'changed')).toBe(0);
  });

  it('waits one step longer after each unchanged run, up to a week', () => {
    let step = 0;
    const waits: number[] = [];
    for (let run = 0; run < 12; run++) {
      step = nextSmartStep(step, 'unchanged');
      waits.push(intervalMs('smart', step));
    }

    expect(waits.slice(0, 2)).toEqual([30 * MINUTE, 60 * MINUTE]);
    expect(waits.at(-1)).toBe(7 * DAY);
    expect(waits).toEqual([...waits].sort((a, b) => a - b));
  });

  it('keeps the step after a failure or hold', () => {
    expect(nextSmartStep(3)).toBe(3);
    expect(nextSmartStep(LAST_STEP + 4)).toBe(LAST_STEP);
  });

  it('starts at 15 minutes and ignores the step for fixed intervals', () => {
    expect(intervalMs('smart', 0)).toBe(15 * MINUTE);
    expect(intervalMs('7d', LAST_STEP)).toBe(7 * DAY);
    expect(intervalMs('off')).toBe(0);
  });
});

describe('smart scheduling in the database', () => {
  type SyncStore = typeof import('@/lib/sync/syncStore');
  type SyncSchedule = typeof import('@/lib/sync/syncSchedule');

  let store: SyncStore;
  let schedule: SyncSchedule;
  let getRecsDb: () => import('better-sqlite3').Database;
  let closeRecsDb: () => void;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'recs-sync-schedule-'));
    vi.stubEnv('RECS_ENABLED', 'true');
    vi.stubEnv('RECS_DB_PATH', join(dir, 'recs.db'));
    vi.resetModules();
    store = await import('@/lib/sync/syncStore');
    schedule = await import('@/lib/sync/syncSchedule');
    ({ getRecsDb, closeRecsDb } = await import('@/lib/recs/db'));
  });

  afterAll(() => {
    closeRecsDb();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  function createPair(name: string, syncInterval: SyncInterval) {
    return store.createSyncPair({
      sourceProvider: 'spotify',
      sourcePlaylistId: `sp-${name}`,
      sourcePlaylistName: 'Source',
      targetProvider: 'tidal',
      targetPlaylistId: `td-${name}`,
      targetPlaylistName: 'Target',
      direction: 'bidirectional',
      createdBy: 'spotify:owner',
      providerUserIds: { spotify: 'spotify:owner', tidal: 'tidal:owner' },
      syncInterval,
    });
  }

  function scheduleOf(id: string): { smartStep: number; waitMs: number } {
    const row = getRecsDb()
      .prepare('SELECT smart_step AS smartStep, next_run_at AS nextRunAt FROM sync_pairs WHERE id = ?')
      .get(id) as { smartStep: number; nextRunAt: string };
    return { smartStep: row.smartStep, waitMs: new Date(row.nextRunAt).getTime() - Date.now() };
  }

  it('backs a smart pair off while nothing changes and resets it on a change', () => {
    const pair = createPair('backoff', 'smart');

    schedule.advanceNextRunAt(pair.id, 'unchanged');
    schedule.advanceNextRunAt(pair.id, 'unchanged');
    schedule.advanceNextRunAt(pair.id, 'unchanged');
    expect(scheduleOf(pair.id).smartStep).toBe(3);
    expect(scheduleOf(pair.id).waitMs).toBeGreaterThan(2.5 * 60 * MINUTE);

    schedule.advanceNextRunAt(pair.id, 'changed');
    expect(scheduleOf(pair.id).smartStep).toBe(0);
    expect(scheduleOf(pair.id).waitMs).toBeLessThan(17 * MINUTE);
  });

  it('runs a smart pair shortly after one of its playlists is edited in Listmagify', () => {
    const pair = createPair('edited', 'smart');
    schedule.advanceNextRunAt(pair.id, 'unchanged');
    schedule.advanceNextRunAt(pair.id, 'unchanged');

    expect(schedule.scheduleSmartPairsAfterEdit('tidal', 'td-edited')).toBe(1);

    const after = scheduleOf(pair.id);
    expect(after.smartStep).toBe(0);
    expect(after.waitMs).toBeLessThanOrEqual(schedule.EDIT_DEBOUNCE_MS);
    expect(after.waitMs).toBeGreaterThan(schedule.EDIT_DEBOUNCE_MS - MINUTE);
  });

  it('leaves fixed-interval pairs alone when their playlists are edited', () => {
    const pair = createPair('fixed', '24h');
    const before = scheduleOf(pair.id);

    expect(schedule.scheduleSmartPairsAfterEdit('spotify', 'sp-fixed')).toBe(0);
    expect(scheduleOf(pair.id).waitMs).toBeGreaterThan(before.waitMs - MINUTE);
  });

  it('resets the smart step when the interval is changed', () => {
    const pair = createPair('switch', 'smart');
    schedule.advanceNextRunAt(pair.id, 'unchanged');

    store.updateSyncPairInterval(pair.id, 'smart');

    expect(scheduleOf(pair.id).smartStep).toBe(0);
  });
});
