/**
 * Unit tests for sync snapshot canonicalization.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canonicalizeSnapshot } from '@/lib/sync/snapshot';
import type { Track } from '@/lib/music-provider/types';
import type { CanonicalMappingResult } from '@/lib/resolver/canonicalResolver';

// Mock the canonical resolver (depends on DB)
vi.mock('@/lib/resolver/canonicalResolver', () => ({
  fromProviderTrack: vi.fn(),
}));

import { fromProviderTrack } from '@/lib/resolver/canonicalResolver';

const mockFromProviderTrack = vi.mocked(fromProviderTrack);

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

beforeEach(() => {
  vi.clearAllMocks();
  mockFromProviderTrack.mockReturnValue(createMappingResult());
});

describe('canonicalizeSnapshot', () => {
  it('maps tracks to canonical items correctly', () => {
    const tracks: Track[] = [
      createTrack({ id: 'sp-1', name: 'Song A', artists: ['Artist A'], durationMs: 200000 }),
      createTrack({ id: 'sp-2', name: 'Song B', artists: ['Artist B'], durationMs: 300000 }),
    ];

    mockFromProviderTrack
      .mockReturnValueOnce(createMappingResult({ canonicalTrackId: 'can-1', matchScore: 0.95, confidence: 'high' }))
      .mockReturnValueOnce(createMappingResult({ canonicalTrackId: 'can-2', matchScore: 0.8, confidence: 'medium' }));

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

  it('calls fromProviderTrack with correct params for each track', () => {
    const tracks: Track[] = [
      createTrack({ id: 'sp-1', name: 'Song A', artists: ['Artist A', 'Artist B'], durationMs: 250000 }),
    ];

    mockFromProviderTrack.mockReturnValue(createMappingResult());

    canonicalizeSnapshot('tidal', 'pl-42', tracks, null);

    expect(mockFromProviderTrack).toHaveBeenCalledTimes(1);
    expect(mockFromProviderTrack).toHaveBeenCalledWith({
      provider: 'tidal',
      providerTrackId: 'sp-1',
      title: 'Song A',
      artists: ['Artist A', 'Artist B'],
      durationMs: 250000,
      isrc: null,
    });
  });

  it('uses URI as fallback providerTrackId when track.id is null', () => {
    const tracks: Track[] = [
      createTrack({ id: null, uri: 'spotify:track:fallback-uri', name: 'No ID Track' }),
    ];

    mockFromProviderTrack.mockReturnValue(createMappingResult({ canonicalTrackId: 'can-fallback' }));

    const snapshot = canonicalizeSnapshot('spotify', 'pl-1', tracks, null);

    expect(mockFromProviderTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTrackId: 'spotify:track:fallback-uri',
      }),
    );
    expect(snapshot.items[0]!.providerTrackId).toBe('spotify:track:fallback-uri');
  });

  it('returns correct trackCount', () => {
    const tracks: Track[] = [
      createTrack({ id: 'sp-1' }),
      createTrack({ id: 'sp-2' }),
      createTrack({ id: 'sp-3' }),
    ];

    mockFromProviderTrack.mockReturnValue(createMappingResult());

    const snapshot = canonicalizeSnapshot('spotify', 'pl-1', tracks, null);

    expect(snapshot.trackCount).toBe(3);
    expect(snapshot.items).toHaveLength(3);
  });

  it('handles empty tracks array', () => {
    const snapshot = canonicalizeSnapshot('spotify', 'pl-1', [], 'snap-1');

    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.trackCount).toBe(0);
    expect(mockFromProviderTrack).not.toHaveBeenCalled();
  });

  it('assigns position based on array index', () => {
    const tracks: Track[] = [
      createTrack({ id: 'sp-1' }),
      createTrack({ id: 'sp-2' }),
      createTrack({ id: 'sp-3' }),
    ];

    mockFromProviderTrack.mockReturnValue(createMappingResult());

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

    mockFromProviderTrack.mockReturnValue(createMappingResult());

    const snapshot = canonicalizeSnapshot('spotify', 'pl-1', tracks, null);

    expect(snapshot.items[0]!.title).toBe('Original Title');
    expect(snapshot.items[0]!.artists).toEqual(['Artist One', 'Artist Two']);
    expect(snapshot.items[0]!.durationMs).toBe(123456);
  });
});
