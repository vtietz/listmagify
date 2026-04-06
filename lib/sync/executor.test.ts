import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncPair } from '@/lib/sync/types';
import type { PlaylistSnapshot } from '@/lib/sync/snapshot';

vi.mock('@/lib/sync/backgroundProvider', () => ({
  createBackgroundProvider: vi.fn(),
}));

vi.mock('@/lib/sync/snapshot', () => ({
  captureSnapshot: vi.fn(),
  fetchPlaylistSnapshotId: vi.fn(),
}));

vi.mock('@/lib/sync/apply', () => ({
  applySyncPlan: vi.fn(),
}));

vi.mock('@/lib/auth/sessionFromDb', () => ({
  getSessionFromDb: vi.fn(),
}));

vi.mock('@/lib/sync/syncStore', () => ({
  createSyncRun: vi.fn(),
  updateSyncRun: vi.fn(),
  advanceNextRunAt: vi.fn(),
  setNextRunAtFromNow: vi.fn(),
  incrementConsecutiveFailures: vi.fn(),
  resetConsecutiveFailures: vi.fn(),
  updateSyncPairSnapshotIds: vi.fn(),
  updateSyncPairBidirectionalMetadata: vi.fn(),
}));

import { executeSyncRun } from '@/lib/sync/executor';
import { createBackgroundProvider } from '@/lib/sync/backgroundProvider';
import { captureSnapshot, fetchPlaylistSnapshotId } from '@/lib/sync/snapshot';
import { applySyncPlan } from '@/lib/sync/apply';
import { getSessionFromDb } from '@/lib/auth/sessionFromDb';
import {
  updateSyncPairSnapshotIds,
  updateSyncPairBidirectionalMetadata,
} from '@/lib/sync/syncStore';

const mockedCreateBackgroundProvider = vi.mocked(createBackgroundProvider);
const mockedCaptureSnapshot = vi.mocked(captureSnapshot);
const mockedFetchPlaylistSnapshotId = vi.mocked(fetchPlaylistSnapshotId);
const mockedApplySyncPlan = vi.mocked(applySyncPlan);
const mockedGetSessionFromDb = vi.mocked(getSessionFromDb);
const mockedUpdateSyncPairSnapshotIds = vi.mocked(updateSyncPairSnapshotIds);
const mockedUpdateSyncPairBidirectionalMetadata = vi.mocked(updateSyncPairBidirectionalMetadata);

function createPair(): SyncPair {
  return {
    id: 'pair-1',
    sourceProvider: 'spotify',
    sourcePlaylistId: 'spotify-playlist',
    sourcePlaylistName: 'Source',
    targetProvider: 'tidal',
    targetPlaylistId: 'tidal-playlist',
    targetPlaylistName: 'Target',
    direction: 'bidirectional',
    createdBy: 'spotify:user-1',
    providerUserIds: {
      spotify: 'spotify:user-1',
      tidal: 'tidal:user-1',
    },
    autoSync: true,
    syncInterval: '1h',
    nextRunAt: null,
    consecutiveFailures: 0,
    sourceSnapshotId: null,
    targetSnapshotId: null,
    sourceMembershipBaseline: ['a', 'b'],
    targetMembershipBaseline: ['a', 'b'],
    sourceOrderBaseline: ['a', 'b'],
    targetOrderBaseline: ['a', 'b'],
    sourceLastChangeAt: '2026-04-06T10:00:00.000Z',
    targetLastChangeAt: '2026-04-06T12:00:00.000Z',
    createdAt: '2026-04-06T00:00:00.000Z',
    updatedAt: '2026-04-06T00:00:00.000Z',
  };
}

function makeSnapshot(providerId: 'spotify' | 'tidal', playlistId: string, ids: string[], snapshotId: string): PlaylistSnapshot {
  return {
    providerId,
    playlistId,
    snapshotId,
    items: ids.map((id, index) => ({
      canonicalTrackId: id,
      providerTrackId: `${providerId}:${id}`,
      matchScore: 1,
      confidence: 'high' as const,
      title: id,
      artists: ['artist'],
      durationMs: 180000,
      position: index,
    })),
    trackCount: ids.length,
  };
}

describe('executeSyncRun bidirectional metadata planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSessionFromDb.mockResolvedValue({} as never);
    mockedCreateBackgroundProvider.mockResolvedValue({} as never);
    mockedFetchPlaylistSnapshotId.mockResolvedValue(null);
    mockedApplySyncPlan.mockResolvedValue({
      added: 1,
      removed: 1,
      unresolved: [],
      errors: [],
    });
  });

  it('builds metadata-aware bidirectional plan and updates baselines', async () => {
    const pair = createPair();

    const sourceBefore = makeSnapshot('spotify', pair.sourcePlaylistId, ['a'], 'source-before');
    const targetBefore = makeSnapshot('tidal', pair.targetPlaylistId, ['c', 'a', 'b'], 'target-before');
    const sourceAfter = makeSnapshot('spotify', pair.sourcePlaylistId, ['c', 'a'], 'source-after');
    const targetAfter = makeSnapshot('tidal', pair.targetPlaylistId, ['c', 'a'], 'target-after');

    mockedCaptureSnapshot
      .mockResolvedValueOnce(sourceBefore)
      .mockResolvedValueOnce(targetBefore)
      .mockResolvedValueOnce(sourceAfter)
      .mockResolvedValueOnce(targetAfter);

    await executeSyncRun('run-1', {
      pair,
      triggeredBy: 'manual',
    });

    expect(mockedApplySyncPlan).toHaveBeenCalledTimes(1);
    const plan = mockedApplySyncPlan.mock.calls[0]?.[0];
    expect(plan?.direction).toBe('bidirectional');

    const addToSource = plan?.items.find((item) => item.action === 'add' && item.targetProvider === 'spotify');
    const removeFromTarget = plan?.items.find((item) => item.action === 'remove' && item.targetProvider === 'tidal');

    expect(addToSource?.canonicalTrackId).toBe('c');
    expect(removeFromTarget?.canonicalTrackId).toBe('b');

    expect(plan?.targetOrder?.spotify).toEqual(['c', 'a']);
    expect(plan?.targetOrder?.tidal).toEqual(['c', 'a']);

    expect(mockedUpdateSyncPairSnapshotIds).toHaveBeenCalledWith(pair.id, 'source-before', 'target-before');

    expect(mockedUpdateSyncPairBidirectionalMetadata).toHaveBeenCalledTimes(1);
    const metadata = mockedUpdateSyncPairBidirectionalMetadata.mock.calls[0]?.[1];
    expect(metadata).toMatchObject({
      sourceMembershipBaseline: ['a', 'c'],
      targetMembershipBaseline: ['a', 'c'],
      sourceOrderBaseline: ['c', 'a'],
      targetOrderBaseline: ['c', 'a'],
      sourceLastChangeAt: expect.any(String),
      targetLastChangeAt: expect.any(String),
    });
  });
});
