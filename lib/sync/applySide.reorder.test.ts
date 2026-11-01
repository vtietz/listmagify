import { describe, expect, it, vi } from 'vitest';
import { applySide, buildReorderedUris } from '@/lib/sync/applySide';
import type { MusicProvider } from '@/lib/music-provider/types';

vi.mock('@/lib/resolver/canonicalResolver', () => ({
  lookupCanonicalTrackIds: (_provider: string, ids: string[]) => new Map(ids.map((id) => [id, id.replace(/^.*:/, '')])),
}));

function fakeProvider(uris: string[], total = uris.length) {
  return {
    getPlaylistTrackUris: vi.fn().mockResolvedValue(uris),
    getPlaylistTracks: vi.fn().mockResolvedValue({ tracks: [], total, nextCursor: null, snapshotId: null }),
    reorderTracks: vi.fn().mockResolvedValue({ snapshotId: 's' }),
    replacePlaylistTracks: vi.fn().mockResolvedValue({ snapshotId: 's' }),
  };
}

describe('buildReorderedUris', () => {
  it('places tracks by the canonical ID of the URI actually in the playlist', () => {
    // "lovefool-release-a" is the entry in the playlist; the preferred mapping for
    // canonical "lovefool" may point at another release, which must not matter.
    const current = ['sp:other', 'sp:saxobeat-radio-edit', 'sp:lovefool-release-a', 'sp:fred'];
    const canonicalByUri = new Map([
      ['sp:fred', 'fred'],
      ['sp:lovefool-release-a', 'lovefool'],
      ['sp:saxobeat-radio-edit', 'saxobeat'],
      ['sp:other', 'other'],
    ]);

    const ordered = buildReorderedUris(current, canonicalByUri, ['fred', 'lovefool', 'saxobeat', 'other']);

    expect(ordered).toEqual(['sp:fred', 'sp:lovefool-release-a', 'sp:saxobeat-radio-edit', 'sp:other']);
  });

  it('keeps duplicates together and never drops entries', () => {
    const current = ['sp:b', 'sp:a', 'sp:c', 'sp:a'];
    const canonicalByUri = new Map([['sp:a', 'a'], ['sp:b', 'b'], ['sp:c', 'c']]);

    const ordered = buildReorderedUris(current, canonicalByUri, ['a', 'b', 'c']);

    expect(ordered).toEqual(['sp:a', 'sp:a', 'sp:b', 'sp:c']);
  });

  it('keeps unmapped or unordered entries at the end in their relative order', () => {
    const current = ['sp:unknown-1', 'sp:b', 'sp:unknown-2', 'sp:a'];
    const canonicalByUri = new Map([['sp:a', 'a'], ['sp:b', 'b']]);

    const ordered = buildReorderedUris(current, canonicalByUri, ['a', 'b']);

    expect(ordered).toEqual(['sp:a', 'sp:b', 'sp:unknown-1', 'sp:unknown-2']);
  });

  it('treats the first desired position as rank 0', () => {
    const ordered = buildReorderedUris(['sp:b', 'sp:a'], new Map([['sp:a', 'a'], ['sp:b', 'b']]), ['a', 'b']);

    expect(ordered).toEqual(['sp:a', 'sp:b']);
  });
});

describe('applySide reordering', () => {
  it('moves entries in place on providers that support it, keeping their added dates', async () => {
    const provider = fakeProvider(['spotify:track:a', 'spotify:track:b', 'spotify:track:n']);

    await applySide([], 'spotify', 'pl', ['a', 'n', 'b'], provider as unknown as MusicProvider);

    expect(provider.reorderTracks).toHaveBeenCalledTimes(1);
    const { fromIndex, toIndex } = provider.reorderTracks.mock.calls[0]![0] as { fromIndex: number; toIndex: number };
    const result = ['a', 'b', 'n'];
    const [moved] = result.splice(fromIndex, 1);
    result.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, moved!);
    expect(result).toEqual(['a', 'n', 'b']);
    expect(provider.replacePlaylistTracks).not.toHaveBeenCalled();
  });

  it('places entries by the sync keys of the plan over the provider-wide mapping', async () => {
    const provider = fakeProvider(['spotify:track:x', 'spotify:track:a']);

    // Without the plan's key, "x" would be unranked and moved behind "a".
    await applySide([], 'spotify', 'pl', ['k', 'a'], provider as unknown as MusicProvider, { x: 'k' });

    expect(provider.reorderTracks).not.toHaveBeenCalled();
  });

  it('falls back to replacing when the URI list misses entries, as moves address entries by index', async () => {
    const provider = fakeProvider(['spotify:track:b', 'spotify:track:a'], 3);

    await applySide([], 'spotify', 'pl', ['a', 'b'], provider as unknown as MusicProvider);

    expect(provider.reorderTracks).not.toHaveBeenCalled();
    expect(provider.replacePlaylistTracks).toHaveBeenCalledWith('pl', ['spotify:track:a', 'spotify:track:b']);
  });

  it('replaces the playlist once where in-place moves are unavailable', async () => {
    const provider = fakeProvider(['tidal:track:b', 'tidal:track:a']);

    await applySide([], 'tidal', 'pl', ['a', 'b'], provider as unknown as MusicProvider);

    expect(provider.reorderTracks).not.toHaveBeenCalled();
    expect(provider.replacePlaylistTracks).toHaveBeenCalledWith('pl', ['tidal:track:a', 'tidal:track:b']);
  });
});
