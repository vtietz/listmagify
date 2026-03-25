import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTidalProvider } from '@/lib/music-provider/tidal/provider';
import { ProviderApiError } from '@/lib/music-provider/types';

type ItemRef = {
  id: string;
  type: 'tracks';
  itemId: string;
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/vnd.api+json' },
  });
}

function createPlaylistItemsPage(references: ItemRef[]) {
  return {
    data: references.map((reference) => ({
      id: reference.id,
      type: reference.type,
      meta: { itemId: reference.itemId },
    })),
    links: { next: null },
  };
}

describe('tidal provider reorder', () => {
  const previousNativeFlag = process.env.TIDAL_NATIVE_REORDER;

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.TIDAL_NATIVE_REORDER = previousNativeFlag;
  });

  it('uses native PATCH reorder payload when feature flag is enabled', async () => {
    process.env.TIDAL_NATIVE_REORDER = '1';

    const references: ItemRef[] = [
      { id: 'track-1', type: 'tracks', itemId: 'item-1' },
      { id: 'track-2', type: 'tracks', itemId: 'item-2' },
      { id: 'track-3', type: 'tracks', itemId: 'item-3' },
      { id: 'track-4', type: 'tracks', itemId: 'item-4' },
      { id: 'track-5', type: 'tracks', itemId: 'item-5' },
    ];

    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/relationships/items?include=items')) {
        return jsonResponse(200, createPlaylistItemsPage(references));
      }

      if (url.endsWith('/relationships/items') && init?.method === 'PATCH') {
        return jsonResponse(200, { data: [] });
      }

      throw new Error(`Unexpected request in test: ${init?.method} ${url}`);
    });

    const provider = createTidalProvider({
      fetchImpl,
      getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
    });

    await provider.reorderTracks({
      playlistId: 'playlist-1',
      fromIndex: 1,
      toIndex: 4,
      rangeLength: 2,
    });

    const patchCall = fetchImpl.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeDefined();

    const patchInit = patchCall?.[1] as RequestInit;
    const payload = JSON.parse(String(patchInit.body));

    expect(payload).toEqual({
      data: [
        { id: 'track-2', type: 'tracks', meta: { itemId: 'item-2' } },
        { id: 'track-3', type: 'tracks', meta: { itemId: 'item-3' } },
      ],
      meta: { positionBefore: 'item-5' },
    });

    const headers = patchInit.headers as Headers;
    expect(headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('sets positionBefore to null when moving to tail', async () => {
    process.env.TIDAL_NATIVE_REORDER = '1';

    const references: ItemRef[] = [
      { id: 'track-1', type: 'tracks', itemId: 'item-1' },
      { id: 'track-2', type: 'tracks', itemId: 'item-2' },
      { id: 'track-3', type: 'tracks', itemId: 'item-3' },
    ];

    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/relationships/items?include=items')) {
        return jsonResponse(200, createPlaylistItemsPage(references));
      }

      if (url.endsWith('/relationships/items') && init?.method === 'PATCH') {
        return jsonResponse(200, { data: [] });
      }

      throw new Error(`Unexpected request in test: ${init?.method} ${url}`);
    });

    const provider = createTidalProvider({
      fetchImpl,
      getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
    });

    await provider.reorderTracks({
      playlistId: 'playlist-1',
      fromIndex: 0,
      toIndex: 3,
      rangeLength: 1,
    });

    const patchCall = fetchImpl.mock.calls.find(([, init]) => init?.method === 'PATCH');
    const patchInit = patchCall?.[1] as RequestInit;
    const payload = JSON.parse(String(patchInit.body));

    expect(payload.meta).toEqual({ positionBefore: null });
  });

  it('falls back to replace strategy when native flag is disabled', async () => {
    process.env.TIDAL_NATIVE_REORDER = '0';

    const references: ItemRef[] = [
      { id: 'track-1', type: 'tracks', itemId: 'item-1' },
      { id: 'track-2', type: 'tracks', itemId: 'item-2' },
      { id: 'track-3', type: 'tracks', itemId: 'item-3' },
    ];

    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/relationships/items?include=items')) {
        return jsonResponse(200, createPlaylistItemsPage(references));
      }

      if (url.endsWith('/relationships/items') && init?.method === 'DELETE') {
        return jsonResponse(200, { data: [] });
      }

      if (url.endsWith('/relationships/items') && init?.method === 'POST') {
        return jsonResponse(200, { data: [] });
      }

      throw new Error(`Unexpected request in test: ${init?.method} ${url}`);
    });

    const provider = createTidalProvider({
      fetchImpl,
      getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
    });

    await provider.reorderTracks({
      playlistId: 'playlist-1',
      fromIndex: 0,
      toIndex: 3,
      rangeLength: 1,
    });

    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
  });

  it('falls back to replace strategy on native unsupported response', async () => {
    process.env.TIDAL_NATIVE_REORDER = '1';

    const references: ItemRef[] = [
      { id: 'track-1', type: 'tracks', itemId: 'item-1' },
      { id: 'track-2', type: 'tracks', itemId: 'item-2' },
      { id: 'track-3', type: 'tracks', itemId: 'item-3' },
    ];

    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/relationships/items?include=items')) {
        return jsonResponse(200, createPlaylistItemsPage(references));
      }

      if (url.endsWith('/relationships/items') && init?.method === 'PATCH') {
        return jsonResponse(501, { errors: [{ detail: 'Not implemented' }] });
      }

      if (url.endsWith('/relationships/items') && init?.method === 'DELETE') {
        return jsonResponse(200, { data: [] });
      }

      if (url.endsWith('/relationships/items') && init?.method === 'POST') {
        return jsonResponse(200, { data: [] });
      }

      throw new Error(`Unexpected request in test: ${init?.method} ${url}`);
    });

    const provider = createTidalProvider({
      fetchImpl,
      getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
    });

    await provider.reorderTracks({
      playlistId: 'playlist-1',
      fromIndex: 0,
      toIndex: 3,
      rangeLength: 1,
    });

    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
  });

  it('surfaces JSON:API detail on native bad request responses', async () => {
    process.env.TIDAL_NATIVE_REORDER = '1';

    const references: ItemRef[] = [
      { id: 'track-1', type: 'tracks', itemId: 'item-1' },
      { id: 'track-2', type: 'tracks', itemId: 'item-2' },
    ];

    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/relationships/items?include=items')) {
        return jsonResponse(200, createPlaylistItemsPage(references));
      }

      if (url.endsWith('/relationships/items') && init?.method === 'PATCH') {
        return jsonResponse(400, { errors: [{ detail: 'Invalid positionBefore anchor' }] });
      }

      throw new Error(`Unexpected request in test: ${init?.method} ${url}`);
    });

    const provider = createTidalProvider({
      fetchImpl,
      getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
    });

    await expect(
      provider.reorderTracks({ playlistId: 'playlist-1', fromIndex: 0, toIndex: 1, rangeLength: 1 }),
    ).rejects.toMatchObject({
      status: 400,
      provider: 'tidal',
      details: 'Invalid positionBefore anchor',
    } satisfies Partial<ProviderApiError>);
  });
});
