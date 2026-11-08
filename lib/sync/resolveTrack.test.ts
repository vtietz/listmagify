import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicProvider } from '@/lib/music-provider/types';
import type { SyncPair, SyncRun } from '@/lib/sync/types';

const mocks = vi.hoisted(() => ({
  setManualProviderMapping: vi.fn(),
  getSyncRunForPair: vi.fn(),
  updateSyncRun: vi.fn(),
  createBackgroundProvider: vi.fn(),
}));

vi.mock('@/lib/resolver/canonicalResolver', () => ({
  setManualProviderMapping: mocks.setManualProviderMapping,
}));
vi.mock('@/lib/sync/syncRunStore', () => ({
  getSyncRunForPair: mocks.getSyncRunForPair,
  updateSyncRun: mocks.updateSyncRun,
}));
vi.mock('@/lib/sync/backgroundProvider', () => ({
  createBackgroundProvider: mocks.createBackgroundProvider,
}));

import { pairPlaylistForProvider, resolveSyncTrack, ResolveTrackError } from '@/lib/sync/resolveTrack';

function makePair(overrides: Partial<SyncPair> = {}): SyncPair {
  return {
    id: 'pair-1',
    sourceProvider: 'spotify',
    sourcePlaylistId: 'src-pl',
    sourcePlaylistName: 'Source',
    targetProvider: 'tidal',
    targetPlaylistId: 'tgt-pl',
    targetPlaylistName: 'Target',
    direction: 'a-to-b',
    createdBy: 'spotify:user',
    providerUserIds: { spotify: 'spotify:user', tidal: 'tidal:42' },
    autoSync: false,
    syncInterval: 'off',
    nextRunAt: null,
    consecutiveFailures: 0,
    sourceSnapshotId: null,
    targetSnapshotId: null,
    sourceMembershipBaseline: null,
    targetMembershipBaseline: null,
    sourceOrderBaseline: null,
    targetOrderBaseline: null,
    sourceLastChangeAt: null,
    targetLastChangeAt: null,
    skippedCanonicalIds: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as SyncPair;
}

function makeRun(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    id: 'run-1',
    syncPairId: 'pair-1',
    status: 'done',
    direction: 'a-to-b',
    tracksAdded: 3,
    tracksRemoved: 0,
    tracksUnresolved: 2,
    errorMessage: null,
    warnings: [
      { canonicalTrackId: 'c1', title: 'One', artists: ['A'], reason: 'Not found', targetProvider: 'tidal' },
      { canonicalTrackId: 'c2', title: 'Two', artists: ['B'], reason: 'Not found', targetProvider: 'tidal' },
    ],
    triggeredBy: 'manual',
    startedAt: '',
    completedAt: '',
    ...overrides,
  };
}

function makeProvider(existingUris: string[] = []): MusicProvider {
  return {
    getPlaylistTrackUris: vi.fn().mockResolvedValue(existingUris),
    addTracks: vi.fn().mockResolvedValue({ snapshotId: 's' }),
  } as unknown as MusicProvider;
}

describe('pairPlaylistForProvider', () => {
  it('uses the target playlist for one-way pairs', () => {
    expect(pairPlaylistForProvider(makePair(), 'tidal')).toEqual({ playlistId: 'tgt-pl', userId: 'tidal:42' });
    expect(pairPlaylistForProvider(makePair(), 'spotify')).toBeNull();
  });

  it('uses the source playlist for reverse pairs', () => {
    const pair = makePair({ direction: 'b-to-a' });
    expect(pairPlaylistForProvider(pair, 'spotify')).toEqual({ playlistId: 'src-pl', userId: 'spotify:user' });
    expect(pairPlaylistForProvider(pair, 'tidal')).toBeNull();
  });

  it('allows both sides for bidirectional pairs', () => {
    const pair = makePair({ direction: 'bidirectional' });
    expect(pairPlaylistForProvider(pair, 'spotify')?.playlistId).toBe('src-pl');
    expect(pairPlaylistForProvider(pair, 'tidal')?.playlistId).toBe('tgt-pl');
  });
});

describe('resolveSyncTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSyncRunForPair.mockReturnValue(makeRun());
  });

  it('saves the mapping, adds the track and clears the warning', async () => {
    const provider = makeProvider();

    const result = await resolveSyncTrack(
      { pair: makePair(), canonicalTrackId: 'c1', targetProvider: 'tidal', providerTrackId: '999', runId: 'run-1' },
      provider,
    );

    expect(mocks.setManualProviderMapping).toHaveBeenCalledWith({
      provider: 'tidal',
      providerTrackId: '999',
      canonicalTrackId: 'c1',
    });
    expect(provider.addTracks).toHaveBeenCalledWith({ playlistId: 'tgt-pl', trackUris: [expect.stringContaining('999')] });
    expect(result).toEqual({ providerTrackId: '999', playlistId: 'tgt-pl', added: true });

    const update = mocks.updateSyncRun.mock.calls[0]!;
    expect(update[0]).toBe('run-1');
    expect(update[1]).toMatchObject({ tracksAdded: 4, tracksUnresolved: 1 });
    expect(JSON.parse(update[1].warningsJson)).toEqual([expect.objectContaining({ canonicalTrackId: 'c2' })]);
  });

  it('does not add a track that is already in the playlist', async () => {
    const provider = makeProvider();
    const uri = (await import('@/lib/music-provider/trackCodec')).toProviderTrackUri('tidal', '999');
    vi.mocked(provider.getPlaylistTrackUris).mockResolvedValue([uri]);

    const result = await resolveSyncTrack(
      { pair: makePair(), canonicalTrackId: 'c1', targetProvider: 'tidal', providerTrackId: '999', runId: 'run-1' },
      provider,
    );

    expect(provider.addTracks).not.toHaveBeenCalled();
    expect(result.added).toBe(false);
    const update = mocks.updateSyncRun.mock.calls[0]![1];
    expect(update.tracksAdded).toBeUndefined();
    expect(update.tracksUnresolved).toBe(1);
  });

  it('clears the warnings column when the last warning is resolved', async () => {
    mocks.getSyncRunForPair.mockReturnValue(makeRun({ warnings: [makeRun().warnings[0]!], tracksUnresolved: 1 }));

    await resolveSyncTrack(
      { pair: makePair(), canonicalTrackId: 'c1', targetProvider: 'tidal', providerTrackId: '999', runId: 'run-1' },
      makeProvider(),
    );

    expect(mocks.updateSyncRun.mock.calls[0]![1]).toMatchObject({ warningsJson: null, tracksUnresolved: 0 });
  });

  it('updates only the run it was given, looked up within the pair', async () => {
    await resolveSyncTrack(
      { pair: makePair(), canonicalTrackId: 'c1', targetProvider: 'tidal', providerTrackId: '999', runId: 'run-1' },
      makeProvider(),
    );
    expect(mocks.getSyncRunForPair).toHaveBeenCalledWith('run-1', 'pair-1');
  });

  it('leaves runs untouched without a run id', async () => {
    const provider = makeProvider();
    await resolveSyncTrack(
      { pair: makePair(), canonicalTrackId: 'c1', targetProvider: 'tidal', providerTrackId: '999' },
      provider,
    );
    expect(provider.addTracks).toHaveBeenCalled();
    expect(mocks.getSyncRunForPair).not.toHaveBeenCalled();
    expect(mocks.updateSyncRun).not.toHaveBeenCalled();
  });

  it('leaves runs untouched when the run belongs to another pair', async () => {
    mocks.getSyncRunForPair.mockReturnValue(null);
    await resolveSyncTrack(
      { pair: makePair(), canonicalTrackId: 'c1', targetProvider: 'tidal', providerTrackId: '999', runId: 'foreign' },
      makeProvider(),
    );
    expect(mocks.updateSyncRun).not.toHaveBeenCalled();
  });

  it('rejects providers the pair does not write to', async () => {
    await expect(resolveSyncTrack(
      { pair: makePair(), canonicalTrackId: 'c1', targetProvider: 'spotify', providerTrackId: 'abc' },
      makeProvider(),
    )).rejects.toBeInstanceOf(ResolveTrackError);
    expect(mocks.setManualProviderMapping).not.toHaveBeenCalled();
  });

  it('keeps the mapping but reports a failed add', async () => {
    const provider = makeProvider();
    vi.mocked(provider.addTracks).mockRejectedValue(new Error('boom'));

    await expect(resolveSyncTrack(
      { pair: makePair(), canonicalTrackId: 'c1', targetProvider: 'tidal', providerTrackId: '999', runId: 'run-1' },
      provider,
    )).rejects.toThrow('boom');
    expect(mocks.setManualProviderMapping).toHaveBeenCalled();
    expect(mocks.updateSyncRun).not.toHaveBeenCalled();
  });
});
