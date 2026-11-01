import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncPair } from '@/lib/sync/types';
import type { PlaylistSnapshot } from '@/lib/sync/snapshot';

vi.mock('@/lib/sync/backgroundProvider', () => ({
  createBackgroundProvider: vi.fn(),
}));

vi.mock('@/lib/sync/snapshot', () => ({
  captureSnapshot: vi.fn(),
  captureSnapshotWithChangeToken: vi.fn(),
  fetchPlaylistSnapshotId: vi.fn(),
}));

vi.mock('@/lib/sync/apply', () => ({
  applySyncPlan: vi.fn(),
}));

vi.mock('@/lib/auth/sessionFromDb', () => ({
  getSessionFromDb: vi.fn(),
}));

vi.mock('@/lib/sync/reauthNotifier', () => ({
  notifyReauthRequired: vi.fn(),
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

vi.mock('@/lib/sync/mirrorStore', () => ({
  loadPairMirror: vi.fn().mockReturnValue([]),
  savePairMirror: vi.fn(),
}));

import { executeSyncRun } from '@/lib/sync/executor';
import { loadPairMirror, savePairMirror } from '@/lib/sync/mirrorStore';
import { createBackgroundProvider } from '@/lib/sync/backgroundProvider';
import { captureSnapshot, captureSnapshotWithChangeToken, fetchPlaylistSnapshotId } from '@/lib/sync/snapshot';
import { applySyncPlan } from '@/lib/sync/apply';
import { getSessionFromDb } from '@/lib/auth/sessionFromDb';
import { notifyReauthRequired } from '@/lib/sync/reauthNotifier';
import {
  advanceNextRunAt,
  incrementConsecutiveFailures,
  updateSyncRun,
  updateSyncPairSnapshotIds,
  updateSyncPairBidirectionalMetadata,
} from '@/lib/sync/syncStore';

const mockedCreateBackgroundProvider = vi.mocked(createBackgroundProvider);
const mockedCaptureSnapshot = vi.mocked(captureSnapshot);
const mockedCaptureAfterSync = vi.mocked(captureSnapshotWithChangeToken);
const mockedFetchPlaylistSnapshotId = vi.mocked(fetchPlaylistSnapshotId);
const mockedApplySyncPlan = vi.mocked(applySyncPlan);
const mockedGetSessionFromDb = vi.mocked(getSessionFromDb);
const mockedUpdateSyncPairSnapshotIds = vi.mocked(updateSyncPairSnapshotIds);
const mockedUpdateSyncPairBidirectionalMetadata = vi.mocked(updateSyncPairBidirectionalMetadata);
const mockedAdvanceNextRunAt = vi.mocked(advanceNextRunAt);
const mockedNotifyReauthRequired = vi.mocked(notifyReauthRequired);
const mockedIncrementConsecutiveFailures = vi.mocked(incrementConsecutiveFailures);
const mockedUpdateSyncRun = vi.mocked(updateSyncRun);
const mockedLoadPairMirror = vi.mocked(loadPairMirror);
const mockedSavePairMirror = vi.mocked(savePairMirror);

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
    skippedCanonicalIds: [],
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
      .mockResolvedValueOnce(targetBefore);
    mockedCaptureAfterSync
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

    // Tokens from after the sync's own writes, so those do not count as changes next time.
    expect(mockedUpdateSyncPairSnapshotIds).toHaveBeenCalledWith(pair.id, 'source-after', 'target-after');

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

describe('executeSyncRun local copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSessionFromDb.mockResolvedValue({} as never);
    mockedCreateBackgroundProvider.mockResolvedValue({} as never);
    mockedFetchPlaylistSnapshotId.mockResolvedValue(null);
    mockedLoadPairMirror.mockReturnValue([]);
    mockedApplySyncPlan.mockResolvedValue({ added: 0, removed: 0, unresolved: [], errors: [], addedKeys: {} });
  });

  it('stores both playlists as the local copy after a run', async () => {
    const pair = createPair();
    const source = makeSnapshot('spotify', pair.sourcePlaylistId, ['a', 'b'], 's');
    const target = makeSnapshot('tidal', pair.targetPlaylistId, ['a', 'b'], 't');
    mockedCaptureSnapshot
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(target);
    mockedCaptureAfterSync
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(target);

    await executeSyncRun('run-1', { pair, triggeredBy: 'manual' });

    expect(mockedSavePairMirror).toHaveBeenCalledTimes(1);
    const entries = mockedSavePairMirror.mock.calls[0]?.[1] ?? [];
    expect(entries.map((entry) => `${entry.side}:${entry.syncKey}`).sort()).toEqual([
      'source:a', 'source:b', 'target:a', 'target:b',
    ]);
  });

  it('holds a scheduled run that would remove most of a playlist, changing nothing', async () => {
    const pair = createPair();
    const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const now = '2026-04-06T12:00:00.000Z';
    mockedLoadPairMirror.mockReturnValue(
      (['source', 'target'] as const).flatMap((side) => ids.map((id, position) => ({
        side,
        entryKey: `${side === 'source' ? 'spotify' : 'tidal'}:${id}#0`,
        providerTrackId: `${side === 'source' ? 'spotify' : 'tidal'}:${id}`,
        syncKey: id,
        position,
        addedAt: null,
        firstSeenAt: now,
        lastSeenAt: now,
        removedAt: null,
      }))),
    );
    mockedCaptureSnapshot
      .mockResolvedValueOnce(makeSnapshot('spotify', pair.sourcePlaylistId, ids.slice(0, 2), 's'))
      .mockResolvedValueOnce(makeSnapshot('tidal', pair.targetPlaylistId, ids, 't'));

    await executeSyncRun('run-1', { pair, triggeredBy: 'scheduler' });

    expect(mockedApplySyncPlan).not.toHaveBeenCalled();
    expect(mockedSavePairMirror).not.toHaveBeenCalled();
    expect(mockedUpdateSyncRun).toHaveBeenCalledWith('run-1', expect.objectContaining({
      status: 'failed',
      errorMessage: expect.stringContaining('18 of 20 tracks would be removed from TIDAL'),
    }));
    // A hold is not a failure: the pair keeps being scheduled and re-checked.
    expect(mockedIncrementConsecutiveFailures).not.toHaveBeenCalled();
    expect(mockedAdvanceNextRunAt).toHaveBeenCalledWith(pair.id);
  });
});

describe('executeSyncRun scheduled failures', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSessionFromDb.mockResolvedValue({} as never);
  });

  it('waits for the next interval after an auth failure instead of retrying every tick', async () => {
    const pair = createPair();
    mockedCreateBackgroundProvider.mockRejectedValue(
      new Error('No valid session for tidal, user=tidal:user-1'),
    );

    await executeSyncRun('run-1', { pair, triggeredBy: 'scheduler' });

    expect(mockedIncrementConsecutiveFailures).toHaveBeenCalledWith(pair.id);
    expect(mockedAdvanceNextRunAt).toHaveBeenCalledWith(pair.id);
  });

  it('asks the notifier to email the user when a scheduled run has no valid session', async () => {
    const pair = createPair();
    mockedGetSessionFromDb.mockImplementation(async (_userId, providerId) =>
      (providerId === 'tidal' ? null : ({} as never)));

    await executeSyncRun('run-1', { pair, triggeredBy: 'scheduler' });

    expect(mockedNotifyReauthRequired).toHaveBeenCalledWith('tidal:user-1', 'tidal');
    expect(mockedCreateBackgroundProvider).not.toHaveBeenCalled();
  });

  it('does not email for manual runs', async () => {
    const pair = createPair();
    mockedGetSessionFromDb.mockResolvedValue(null);

    await executeSyncRun('run-1', { pair, triggeredBy: 'manual' });

    expect(mockedNotifyReauthRequired).not.toHaveBeenCalled();
  });

  it('asks for re-auth on both providers when both sessions are gone', async () => {
    const pair = createPair();
    mockedGetSessionFromDb.mockResolvedValue(null);

    await executeSyncRun('run-1', { pair, triggeredBy: 'scheduler' });

    expect(mockedNotifyReauthRequired).toHaveBeenCalledTimes(2);
    expect(mockedNotifyReauthRequired).toHaveBeenCalledWith('spotify:user-1', 'spotify');
    expect(mockedNotifyReauthRequired).toHaveBeenCalledWith('tidal:user-1', 'tidal');
  });

  it('notifies once for a same-account pair with an expired session', async () => {
    const pair = {
      ...createPair(),
      targetProvider: 'spotify' as const,
      providerUserIds: { spotify: 'spotify:user-1' },
    };
    mockedGetSessionFromDb.mockResolvedValue(null);

    await executeSyncRun('run-1', { pair, triggeredBy: 'scheduler' });

    expect(mockedNotifyReauthRequired).toHaveBeenCalledTimes(1);
    expect(mockedNotifyReauthRequired).toHaveBeenCalledWith('spotify:user-1', 'spotify');
  });

  it('reports token storage misconfiguration when encryption key is missing', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '');
    const pair = createPair();
    mockedGetSessionFromDb.mockResolvedValue(null);

    await executeSyncRun('run-1', { pair, triggeredBy: 'manual' });

    expect(mockedUpdateSyncRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringContaining('Token storage not configured for spotify'),
      }),
    );
  });
});

describe('executeSyncRun smart scheduling', () => {
  const now = '2026-04-06T12:00:00.000Z';

  function mirrorOf(ids: string[]) {
    return (['source', 'target'] as const).flatMap((side) => ids.map((id, position) => {
      const providerId = side === 'source' ? 'spotify' : 'tidal';
      return {
        side,
        entryKey: `${providerId}:${id}#0`,
        providerTrackId: `${providerId}:${id}`,
        syncKey: id,
        position,
        addedAt: null,
        firstSeenAt: now,
        lastSeenAt: now,
        removedAt: null,
      };
    }));
  }

  function syncedPair(overrides: Partial<SyncPair> = {}): SyncPair {
    return {
      ...createPair(),
      syncInterval: 'smart',
      sourceSnapshotId: 's',
      targetSnapshotId: 't',
      lastFullReadAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      ...overrides,
    };
  }

  function readPlaylists(pair: SyncPair, sourceIds: string[], targetIds: string[]): void {
    const source = makeSnapshot('spotify', pair.sourcePlaylistId, sourceIds, 's');
    const target = makeSnapshot('tidal', pair.targetPlaylistId, targetIds, 't');
    mockedCaptureSnapshot.mockResolvedValueOnce(source).mockResolvedValueOnce(target);
    mockedCaptureAfterSync.mockResolvedValueOnce(source).mockResolvedValueOnce(target);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSessionFromDb.mockResolvedValue({} as never);
    mockedCreateBackgroundProvider.mockResolvedValue({} as never);
    mockedFetchPlaylistSnapshotId.mockResolvedValue(null);
    mockedLoadPairMirror.mockReturnValue(mirrorOf(['a', 'b']));
    mockedApplySyncPlan.mockResolvedValue({ added: 0, removed: 0, unresolved: [], errors: [], addedKeys: {} });
  });

  it('counts a run as unchanged when both playlists match the local copy', async () => {
    const pair = syncedPair();
    readPlaylists(pair, ['a', 'b'], ['a', 'b']);

    await executeSyncRun('run-1', { pair, triggeredBy: 'scheduler' });

    expect(mockedAdvanceNextRunAt).toHaveBeenCalledWith(pair.id, 'unchanged');
  });

  it('counts a run as changed when a playlist was edited since the last sync', async () => {
    const pair = syncedPair();
    readPlaylists(pair, ['a', 'b', 'c'], ['a', 'b']);

    await executeSyncRun('run-1', { pair, triggeredBy: 'scheduler' });

    expect(mockedAdvanceNextRunAt).toHaveBeenCalledWith(pair.id, 'changed');
  });

  it('counts a reorder as a change', async () => {
    const pair = syncedPair();
    readPlaylists(pair, ['b', 'a'], ['a', 'b']);

    await executeSyncRun('run-1', { pair, triggeredBy: 'scheduler' });

    expect(mockedAdvanceNextRunAt).toHaveBeenCalledWith(pair.id, 'changed');
  });

  it('counts the first sync as changed', async () => {
    const pair = syncedPair({ sourceSnapshotId: null, targetSnapshotId: null, lastFullReadAt: null });
    mockedLoadPairMirror.mockReturnValue([]);
    readPlaylists(pair, [], []);

    await executeSyncRun('run-1', { pair, triggeredBy: 'scheduler' });

    expect(mockedAdvanceNextRunAt).toHaveBeenCalledWith(pair.id, 'changed');
  });

  it('skips reading the playlists when their change tokens are unchanged', async () => {
    const pair = syncedPair();
    mockedFetchPlaylistSnapshotId.mockResolvedValueOnce('s').mockResolvedValueOnce('t');

    await executeSyncRun('run-1', { pair, triggeredBy: 'scheduler' });

    expect(mockedCaptureSnapshot).not.toHaveBeenCalled();
    expect(mockedAdvanceNextRunAt).toHaveBeenCalledWith(pair.id, 'unchanged');
  });

  it('reads both playlists in full at least daily, even when change tokens are unchanged', async () => {
    const pair = syncedPair({ lastFullReadAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    mockedFetchPlaylistSnapshotId.mockResolvedValue('s');
    readPlaylists(pair, ['a', 'b'], ['a', 'b']);

    await executeSyncRun('run-1', { pair, triggeredBy: 'scheduler' });

    expect(mockedCaptureSnapshot).toHaveBeenCalledTimes(2);
    expect(mockedAdvanceNextRunAt).toHaveBeenCalledWith(pair.id, 'unchanged');
  });
});
