import { describe, expect, it, vi } from 'vitest';
import { createSpotifyProvider } from '@/lib/music-provider/spotify/provider';
import { PlaylistPositionConflictError } from '@/lib/music-provider/types';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Entry = { uri: string | null; addedAt: string };

/**
 * Minimal in-memory model of Spotify's /playlists/{id}/items endpoint
 * (Feb 2026 shape: `item` field, 50 items per page, DELETE removes every occurrence).
 */
function createFakeSpotify(initialUris: Array<string | null>) {
  let entries: Entry[] = initialUris.map((uri) => ({ uri, addedAt: 'original' }));
  let snapshot = 0;
  const writes: Array<{ method: string; body: any }> = [];

  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (!url.pathname.endsWith('/playlists/pl1/items')) {
      return jsonResponse(404, { error: `unexpected ${method} ${url.pathname}` });
    }

    if (method === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      if (limit > 50) {
        return jsonResponse(400, { error: 'limit too large' });
      }
      const page = entries.slice(offset, offset + limit);
      return jsonResponse(200, {
        items: page.map((entry) => ({ added_at: entry.addedAt, item: entry.uri ? { uri: entry.uri } : null })),
        total: entries.length,
        next: offset + limit < entries.length ? `https://api.spotify.com/v1/playlists/pl1/items?offset=${offset + limit}&limit=${limit}` : null,
      });
    }

    writes.push({ method, body });
    snapshot += 1;

    if (method === 'DELETE') {
      const uris = new Set((body.items as Array<{ uri: string }>).map((item) => item.uri));
      entries = entries.filter((entry) => !entry.uri || !uris.has(entry.uri));
    } else if (method === 'POST') {
      const added = (body.uris as string[]).map((uri) => ({ uri, addedAt: 'now' }));
      const position = typeof body.position === 'number' ? body.position : entries.length;
      entries.splice(position, 0, ...added);
    } else if (method === 'PUT') {
      entries = (body.uris as string[]).map((uri) => ({ uri, addedAt: 'now' }));
    }

    return jsonResponse(method === 'POST' ? 201 : 200, { snapshot_id: `snap-${snapshot}` });
  });

  return {
    fetchImpl,
    writes,
    uris: () => entries.map((entry) => entry.uri),
    entries: () => entries,
  };
}

function createProvider(fetchImpl: typeof fetch) {
  return createSpotifyProvider({
    fetchImpl,
    getSession: vi.fn().mockResolvedValue({ accessToken: 'token', accessTokenExpires: Date.now() + 60_000 }),
  });
}

function makeUris(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `spotify:track:t${i}`);
}

describe('spotify removePlaylistTracksAtPositions', () => {
  it('removes a unique track without touching any other entry', async () => {
    const initial = makeUris(250);
    const fake = createFakeSpotify(initial);
    const provider = createProvider(fake.fetchImpl);

    await provider.removePlaylistTracksAtPositions('pl1', [{ uri: 'spotify:track:t120', positions: [120] }]);

    expect(fake.uris()).toEqual(initial.filter((uri) => uri !== 'spotify:track:t120'));
    expect(fake.entries().every((entry) => entry.addedAt === 'original')).toBe(true);
    expect(fake.writes.map((write) => write.method)).toEqual(['DELETE']);
  });

  it('removes one occurrence of a duplicate and re-inserts the kept ones in place', async () => {
    const initial = ['a', 'dup', 'b', 'dup', 'c', 'dup'].map((id) => `spotify:track:${id}`);
    const fake = createFakeSpotify(initial);
    const provider = createProvider(fake.fetchImpl);

    await provider.removePlaylistTracksAtPositions('pl1', [{ uri: 'spotify:track:dup', positions: [3] }]);

    expect(fake.uris()).toEqual(['a', 'dup', 'b', 'c', 'dup'].map((id) => `spotify:track:${id}`));
    expect(fake.writes.some((write) => write.method === 'PUT')).toBe(false);
    // Untouched tracks keep their original metadata
    expect(fake.entries().filter((entry) => !entry.uri?.endsWith('dup')).every((entry) => entry.addedAt === 'original')).toBe(true);
  });

  it('merges adjacent kept duplicates into one insert', async () => {
    const initial = ['dup', 'dup', 'dup', 'x'].map((id) => `spotify:track:${id}`);
    const fake = createFakeSpotify(initial);
    const provider = createProvider(fake.fetchImpl);

    await provider.removePlaylistTracksAtPositions('pl1', [{ uri: 'spotify:track:dup', positions: [0] }]);

    expect(fake.uris()).toEqual(['dup', 'dup', 'x'].map((id) => `spotify:track:${id}`));
    expect(fake.writes.map((write) => write.method)).toEqual(['DELETE', 'POST']);
    expect(fake.writes[1]!.body).toEqual({ uris: ['spotify:track:dup', 'spotify:track:dup'], position: 0 });
  });

  it('keeps unavailable entries so positions stay aligned', async () => {
    const initial = ['spotify:track:a', null, 'spotify:track:b', 'spotify:track:c'];
    const fake = createFakeSpotify(initial);
    const provider = createProvider(fake.fetchImpl);

    await provider.removePlaylistTracksAtPositions('pl1', [{ uri: 'spotify:track:b', positions: [2] }]);

    expect(fake.uris()).toEqual(['spotify:track:a', null, 'spotify:track:c']);
  });

  it('rejects stale positions without writing anything', async () => {
    const fake = createFakeSpotify(makeUris(10));
    const provider = createProvider(fake.fetchImpl);

    await expect(
      provider.removePlaylistTracksAtPositions('pl1', [{ uri: 'spotify:track:t5', positions: [4] }])
    ).rejects.toBeInstanceOf(PlaylistPositionConflictError);
    expect(fake.writes).toHaveLength(0);
  });
});

describe('spotify playlist items endpoints', () => {
  it('pages getPlaylistTrackUris through all entries at 50 per request', async () => {
    const initial = makeUris(120);
    const fake = createFakeSpotify(initial);
    const provider = createProvider(fake.fetchImpl);

    await expect(provider.getPlaylistTrackUris('pl1')).resolves.toEqual(initial);
    expect(fake.fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('replaces large playlists without ever leaving them empty', async () => {
    const fake = createFakeSpotify(makeUris(5));
    const provider = createProvider(fake.fetchImpl);
    const next = makeUris(230).reverse();

    await provider.replacePlaylistTracks('pl1', next);

    expect(fake.uris()).toEqual(next);
    expect(fake.writes.map((write) => write.method)).toEqual(['PUT', 'POST', 'POST']);
    expect(fake.writes[0]!.body.uris).toHaveLength(100);
  });

  it('maps playlist track pages from the new `item` field', async () => {
    const fake = createFakeSpotify(makeUris(60));
    const provider = createProvider(fake.fetchImpl);

    const firstPage = await provider.getPlaylistTracks('pl1', 100, null);
    expect(firstPage.tracks).toHaveLength(50);
    expect(firstPage.tracks[0]!.uri).toBe('spotify:track:t0');
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await provider.getPlaylistTracks('pl1', 100, firstPage.nextCursor);
    expect(secondPage.tracks.map((track) => track.position)).toEqual(Array.from({ length: 10 }, (_, i) => 50 + i));
    expect(secondPage.nextCursor).toBeNull();
  });
});

describe('spotify library endpoints', () => {
  it('saves tracks via /me/library in batches of 40 URIs', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200));
    const provider = createProvider(fetchImpl);
    const ids = Array.from({ length: 90 }, (_, i) => `id${i}`);

    await provider.saveTracks({ ids });

    const urls = fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map((url) => url.pathname)).toEqual(['/v1/me/library', '/v1/me/library', '/v1/me/library']);
    expect(urls.map((url) => url.searchParams.get('uris')!.split(',').length)).toEqual([40, 40, 10]);
    expect(urls[0]!.searchParams.get('uris')!.startsWith('spotify:track:id0,')).toBe(true);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method === 'PUT')).toBe(true);
  });

  it('checks saved state via /me/library/contains and keeps input order', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, Array.from({ length: 40 }, (_, i) => i % 2 === 0)))
      .mockResolvedValueOnce(jsonResponse(200, [true]));
    const provider = createProvider(fetchImpl);
    const ids = Array.from({ length: 41 }, (_, i) => `id${i}`);

    const result = await provider.containsTracks({ ids });

    expect(result).toHaveLength(41);
    expect(result[0]).toBe(true);
    expect(result[1]).toBe(false);
    expect(result[40]).toBe(true);
    expect(new URL(String(fetchImpl.mock.calls[0]![0])).pathname).toBe('/v1/me/library/contains');
  });

  it('unfollows playlists via /me/library', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200));
    const provider = createProvider(fetchImpl);

    await provider.deletePlaylist('pl1');

    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.pathname).toBe('/v1/me/library');
    expect(url.searchParams.get('uris')).toBe('spotify:playlist:pl1');
    expect(fetchImpl.mock.calls[0]![1]?.method).toBe('DELETE');
  });
});
