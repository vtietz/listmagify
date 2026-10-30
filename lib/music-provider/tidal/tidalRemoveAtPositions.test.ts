import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTidalProvider } from '@/lib/music-provider/tidal/provider';
import { PlaylistPositionConflictError } from '@/lib/music-provider/types';

type ItemRef = { id: string; type: 'tracks' | 'videos'; itemId: string };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/vnd.api+json' },
  });
}

function createFetch(references: ItemRef[]) {
  return vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/relationships/items?include=items')) {
      return jsonResponse(200, {
        data: references.map((reference) => ({
          id: reference.id,
          type: reference.type,
          meta: { itemId: reference.itemId },
        })),
        links: { next: null },
      });
    }

    if (url.endsWith('/relationships/items') && init?.method === 'DELETE') {
      return jsonResponse(200, { data: [] });
    }

    throw new Error(`Unexpected request in test: ${init?.method} ${url}`);
  });
}

function createProvider(fetchImpl: typeof fetch) {
  return createTidalProvider({
    fetchImpl,
    getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
  });
}

function deletedItemIds(fetchImpl: ReturnType<typeof createFetch>): string[] {
  return fetchImpl.mock.calls
    .filter(([, init]) => init?.method === 'DELETE')
    .flatMap(([, init]) => JSON.parse(String(init?.body)).data.map((entry: any) => entry.meta.itemId));
}

describe('tidal removePlaylistTracksAtPositions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes only the item at the requested position of a duplicated track', async () => {
    const fetchImpl = createFetch([
      { id: '1', type: 'tracks', itemId: 'item-a' },
      { id: '2', type: 'tracks', itemId: 'item-b' },
      { id: '1', type: 'tracks', itemId: 'item-c' },
    ]);
    const provider = createProvider(fetchImpl);

    await provider.removePlaylistTracksAtPositions('playlist-1', [{ uri: 'tidal:track:1', positions: [2] }]);

    expect(deletedItemIds(fetchImpl)).toEqual(['item-c']);
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('counts positions over track entries only', async () => {
    const fetchImpl = createFetch([
      { id: '1', type: 'tracks', itemId: 'item-a' },
      { id: 'v1', type: 'videos', itemId: 'item-v' },
      { id: '2', type: 'tracks', itemId: 'item-b' },
    ]);
    const provider = createProvider(fetchImpl);

    await provider.removePlaylistTracksAtPositions('playlist-1', [{ uri: 'tidal:track:2', positions: [1] }]);

    expect(deletedItemIds(fetchImpl)).toEqual(['item-b']);
  });

  it('rejects positions that no longer match the playlist', async () => {
    const fetchImpl = createFetch([{ id: '1', type: 'tracks', itemId: 'item-a' }]);
    const provider = createProvider(fetchImpl);

    await expect(
      provider.removePlaylistTracksAtPositions('playlist-1', [{ uri: 'tidal:track:9', positions: [0] }])
    ).rejects.toBeInstanceOf(PlaylistPositionConflictError);
    expect(deletedItemIds(fetchImpl)).toEqual([]);
  });
});
