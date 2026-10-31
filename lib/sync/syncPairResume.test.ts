import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SyncInterval } from '@/lib/sync/types';

type SyncStore = typeof import('@/lib/sync/syncStore');
type SyncPairResume = typeof import('@/lib/sync/syncPairResume');

let store: SyncStore;
let resume: SyncPairResume;
let closeRecsDb: () => void;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'recs-sync-resume-'));
  vi.stubEnv('RECS_ENABLED', 'true');
  vi.stubEnv('RECS_DB_PATH', join(dir, 'recs.db'));
  vi.resetModules();
  store = await import('@/lib/sync/syncStore');
  resume = await import('@/lib/sync/syncPairResume');
  ({ closeRecsDb } = await import('@/lib/recs/db'));
});

afterAll(() => {
  closeRecsDb();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function createFailedPair(tidalUserId: string, syncInterval: SyncInterval, failures: number) {
  const pair = store.createSyncPair({
    sourceProvider: 'spotify',
    sourcePlaylistId: `sp-${tidalUserId}-${syncInterval}`,
    sourcePlaylistName: 'Source',
    targetProvider: 'tidal',
    targetPlaylistId: `td-${tidalUserId}-${syncInterval}`,
    targetPlaylistName: 'Target',
    direction: 'bidirectional',
    createdBy: 'spotify:owner',
    providerUserIds: { spotify: 'spotify:owner', tidal: tidalUserId },
    syncInterval,
  });
  for (let i = 0; i < failures; i++) {
    store.incrementConsecutiveFailures(pair.id);
  }
  return pair;
}

describe('resumeFailedSyncPairsForUser', () => {
  it('clears failures and makes scheduled pairs of the user due again', () => {
    const paused = createFailedPair('tidal:111', '1h', 5);
    const healthy = createFailedPair('tidal:111', '6h', 0);
    const otherUser = createFailedPair('tidal:222', '1h', 5);

    expect(store.getDueSyncPairs(10).map((p) => p.id)).not.toContain(paused.id);

    const resumed = resume.resumeFailedSyncPairsForUser('tidal:111');

    expect(resumed).toBe(1);
    expect(store.getSyncPair(paused.id)?.consecutiveFailures).toBe(0);
    expect(store.getDueSyncPairs(10).map((p) => p.id)).toContain(paused.id);
    expect(store.getSyncPair(healthy.id)?.nextRunAt).toBe(healthy.nextRunAt);
    expect(store.getSyncPair(otherUser.id)?.consecutiveFailures).toBe(5);
  });

  it('leaves pairs with sync turned off alone', () => {
    const off = createFailedPair('tidal:333', 'off', 3);

    expect(resume.resumeFailedSyncPairsForUser('tidal:333')).toBe(0);
    expect(store.getSyncPair(off.id)?.consecutiveFailures).toBe(3);
  });
});
