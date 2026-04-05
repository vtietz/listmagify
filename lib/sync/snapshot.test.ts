/**
 * Unit tests for sync snapshot functions: canonicalization, snapshot ID
 * fetching, and full playlist/liked-songs track fetching.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canonicalizeSnapshot,
  fetchPlaylistSnapshotId,
  fetchFullPlaylistTracks,
} from '@/lib/sync/snapshot';
import { LIKED_SONGS_PLAYLIST_ID } from '@/lib/sync/likedSongs';
import type { MusicProvider, Track } from '@/lib/music-provider/types';
import type { CanonicalMappingResult, ResolveProviderTrackInput } from '@/lib/resolver/canonicalResolver';

// Mock the canonical resolver (depends on DB)
vi.mock('@/lib/resolver/canonicalResolver', () => ({
  fromProviderTrackBatch: vi.fn(),
}));

import { fromProviderTrackBatch } from '@/lib/resolver/canonicalResolver';

const mockFromProviderTrackBatch = vi.mocked(fromProviderTrackBatch);

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-id-1',
    uri: 'spotify:track:abc123',
    name: 'Test Track',
    artists: ['Test Artist'],
    durationMs: 180000,
    ...overrides,
  };
}

function createMappingResult(overrides: Partial<CanonicalMappingResult> = {}): CanonicalMappingResult {
  return {
    canonicalTrackId: 'canonical-abc',
    matchScore: 1,
    confidence: 'high',
    fromCache: false,
    ...overrides,
  };
}

/**
 * Helper: make the batch mock return one result per input,
 * using the provided mapping results in order.
 */
function mockBatchResults(...results: CanonicalMappingResult[]): void {
  mockFromProviderTrackBatch.mockImplementation((inputs: ResolveProviderTrackInput[]) => {
    return inputs.map((_, i) => results[i] ?? createMappingResult());
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBatchResults(createMappingResult());
});

describe('canonicalizeSnapshot', () => {
  it('maps tracks to canonical items correctly', () => {
    const tracks: Track[] = [
      createTrack({ id: 'sp-1', name: 'Song A', artists: ['Artist A'], durationMs: 200000 }),
      createTrack({ id: 'sp-2', name: 'Song B', artists: ['Artist B'], durationMs: 300000 }),
    ];

    mockBatchResults(
      createMappingResult({ canonicalTrackId: 'can-1', matchScore: 0.95, confidence: 'high' }),
      createMappingResult({ canonicalTrackId: 'can-2', matchScore: 0.8, confidence: 'medium' }),
    );

    const snapshot = canonicalizeSnapshot('spotify', 'pl-1', tracks, 'snap-123');

    expect(snapshot.providerId).toBe('spotify');
    expect(snapshot.playlistId).toBe('pl-1');
    expect(snapshot.snapshotId).toBe('snap-123');
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.trackCount).toBe(2);

    expect(snapshot.items[0]).toEqual({
      canonicalTrackId: 'can-1',
      providerTrackId: 'sp-1',
      matchScore: 0.95,
      confidence: 'high',
      title: 'Song A',
      artists: ['Artist A'],
      durationMs: 200000,
      position: 0,
    });

    expect(snapshot.items[1]).toEqual({
      canonicalTrackId: 'can-2',
      providerTrackId: 'sp-2',
      matchScore: 0.8,
      confidence: 'medium',
      title: 'Song B',
      artists: ['Artist B'],
      durationMs: 300000,
      position: 1,
    });
  });

  it('calls fromProviderTrackBatch with correct params for all tracks', () => {
    const tracks: Track[] = [
      createTrack({ id: 'sp-1', name: 'Song A', artists: ['Artist A', 'Artist B'], durationMs: 250000 }),
    ];

    mockBatchResults(createMappingResult());

    canonicalizeSnapshot('tidal', 'pl-42', tracks, null);

    expect(mockFromProviderTrackBatch).toHaveBeenCalledTimes(1);
    expect(mockFromProviderTrackBatch).toHaveBeenCalledWith(
      [
        {
          provider: 'tidal',
          providerTrackId: 'sp-1',
          title: 'Song A',
          artists: ['Artist A', 'Artist B'],
          durationMs: 250000,
          isrc: null,
        },
      ],
      undefined,
    );
  });

  it('uses URI as fallback providerTrackId when track.id is null', () => {
    const tracks: Track[] = [
      createTrack({ id: null, uri: 'spotify:track:fallback-uri', name: 'No ID Track' }),
    ];

    mockBatchResults(createMappingResult({ canonicalTrackId: 'can-fallback' }));

    const snapshot = canonicalizeSnapshot('spotify', 'pl-1', tracks, null);

    expect(mockFromProviderTrackBatch).toHaveBeenCalledWith(
      [expect.objectContaining({ providerTrackId: 'spotify:track:fallback-uri' })],
      undefined,
    );
    expect(snapshot.items[0]!.providerTrackId).toBe('spotify:track:fallback-uri');
  });

  it('returns correct trackCount', () => {
    const tracks: Track[] = [
      createTrack({ id: 'sp-1' }),
      createTrack({ id: 'sp-2' }),
      createTrack({ id: 'sp-3' }),
    ];

    mockBatchResults(createMappingResult(), createMappingResult(), createMappingResult());

    const snapshot = canonicalizeSnapshot('spotify', 'pl-1', tracks, null);

    expect(snapshot.trackCount).toBe(3);
    expect(snapshot.items).toHaveLength(3);
  });

  it('handles empty tracks array', () => {
    const snapshot = canonicalizeSnapshot('spotify', 'pl-1', [], 'snap-1');

    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.trackCount).toBe(0);
    expect(mockFromProviderTrackBatch).toHaveBeenCalledWith([], undefined);
  });

  it('assigns position based on array index', () => {
    const tracks: Track[] = [
      createTrack({ id: 'sp-1' }),
      createTrack({ id: 'sp-2' }),
      createTrack({ id: 'sp-3' }),
    ];

    mockBatchResults(createMappingResult(), createMappingResult(), createMappingResult());

    const snapshot = canonicalizeSnapshot('spotify', 'pl-1', tracks, null);

    expect(snapshot.items[0]!.position).toBe(0);
    expect(snapshot.items[1]!.position).toBe(1);
    expect(snapshot.items[2]!.position).toBe(2);
  });

  it('passes null snapshotId through', () => {
    const snapshot = canonicalizeSnapshot('spotify', 'pl-1', [], null);

    expect(snapshot.snapshotId).toBeNull();
  });

  it('preserves track metadata from the original track', () => {
    const tracks: Track[] = [
      createTrack({
        id: 'sp-1',
        name: 'Original Title',
        artists: ['Artist One', 'Artist Two'],
        durationMs: 123456,
      }),
    ];

    mockBatchResults(createMappingResult());

    const snapshot = canonicalizeSnapshot('spotify', 'pl-1', tracks, null);

    expect(snapshot.items[0]!.title).toBe('Original Title');
    expect(snapshot.items[0]!.artists).toEqual(['Artist One', 'Artist Two']);
    expect(snapshot.items[0]!.durationMs).toBe(123456);
  });
});

// ---------------------------------------------------------------------------
// Helpers for provider-level tests
// ---------------------------------------------------------------------------

function createMockProvider(
  overrides: Partial<MusicProvider> = {},
): MusicProvider {
  return {
    getPlaylistTracks: vi.fn(),
    getLikedTracks: vi.fn(),
    ...overrides,
  } as unknown as MusicProvider;
}

// ---------------------------------------------------------------------------
// fetchPlaylistSnapshotId
// ---------------------------------------------------------------------------

describe('fetchPlaylistSnapshotId', () => {
  it('returns null immediately for liked songs without calling getPlaylistTracks', async () => {
    const provider = createMockProvider();

    const result = await fetchPlaylistSnapshotId(provider, LIKED_SONGS_PLAYLIST_ID);

    expect(result).toBeNull();
    expect(provider.getPlaylistTracks).not.toHaveBeenCalled();
  });

  it('calls getPlaylistTracks for regular playlist IDs and returns snapshotId', async () => {
    const provider = createMockProvider({
      getPlaylistTracks: vi.fn().mockResolvedValue({
        tracks: [createTrack()],
        snapshotId: 'snap-abc',
        total: 10,
        nextCursor: null,
      }),
    });

    const result = await fetchPlaylistSnapshotId(provider, 'regular-playlist-id');

    expect(result).toBe('snap-abc');
    expect(provider.getPlaylistTracks).toHaveBeenCalledTimes(1);
    expect(provider.getPlaylistTracks).toHaveBeenCalledWith('regular-playlist-id', 1, null);
  });
});

// ---------------------------------------------------------------------------
// fetchFullPlaylistTracks
// ---------------------------------------------------------------------------

describe('fetchFullPlaylistTracks', () => {
  it('calls getLikedTracks (not getPlaylistTracks) when playlistId is liked', async () => {
    const likedTrack = createTrack({ id: 'liked-1', name: 'Liked Song' });
    const provider = createMockProvider({
      getLikedTracks: vi.fn().mockResolvedValue({
        tracks: [likedTrack],
        total: 1,
        nextCursor: null,
      }),
    });

    const result = await fetchFullPlaylistTracks(provider, LIKED_SONGS_PLAYLIST_ID);

    expect(provider.getLikedTracks).toHaveBeenCalledTimes(1);
    expect(provider.getPlaylistTracks).not.toHaveBeenCalled();
    expect(result.tracks).toEqual([likedTrack]);
  });

  it('paginates through multiple liked tracks pages correctly', async () => {
    const page1Tracks = [
      createTrack({ id: 'liked-1', name: 'Song 1' }),
      createTrack({ id: 'liked-2', name: 'Song 2' }),
    ];
    const page2Tracks = [
      createTrack({ id: 'liked-3', name: 'Song 3' }),
    ];

    const getLikedTracks = vi.fn()
      .mockResolvedValueOnce({
        tracks: page1Tracks,
        total: 3,
        nextCursor: 'cursor-page-2',
      })
      .mockResolvedValueOnce({
        tracks: page2Tracks,
        total: 3,
        nextCursor: null,
      });

    const provider = createMockProvider({ getLikedTracks });

    const result = await fetchFullPlaylistTracks(provider, LIKED_SONGS_PLAYLIST_ID);

    expect(getLikedTracks).toHaveBeenCalledTimes(2);
    expect(getLikedTracks).toHaveBeenNthCalledWith(1, 100, null);
    expect(getLikedTracks).toHaveBeenNthCalledWith(2, 100, 'cursor-page-2');
    expect(result.tracks).toHaveLength(3);
    expect(result.tracks).toEqual([...page1Tracks, ...page2Tracks]);
  });

  it('returns snapshotId as null for liked songs', async () => {
    const provider = createMockProvider({
      getLikedTracks: vi.fn().mockResolvedValue({
        tracks: [],
        total: 0,
        nextCursor: null,
      }),
    });

    const result = await fetchFullPlaylistTracks(provider, LIKED_SONGS_PLAYLIST_ID);

    expect(result.snapshotId).toBeNull();
  });

  it('calls getPlaylistTracks for regular playlist IDs (regression)', async () => {
    const regularTrack = createTrack({ id: 'reg-1', name: 'Regular Song' });
    const provider = createMockProvider({
      getPlaylistTracks: vi.fn().mockResolvedValue({
        tracks: [regularTrack],
        snapshotId: 'snap-regular',
        total: 1,
        nextCursor: null,
      }),
    });

    const result = await fetchFullPlaylistTracks(provider, 'some-playlist-id');

    expect(provider.getPlaylistTracks).toHaveBeenCalledTimes(1);
    expect(provider.getPlaylistTracks).toHaveBeenCalledWith('some-playlist-id', 100, null);
    expect(provider.getLikedTracks).not.toHaveBeenCalled();
    expect(result.tracks).toEqual([regularTrack]);
    expect(result.snapshotId).toBe('snap-regular');
  });
});
