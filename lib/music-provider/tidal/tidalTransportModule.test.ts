import { describe, expect, it, vi } from 'vitest';
import { createTidalTransport } from '@/lib/music-provider/tidal/transport';

function makeResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('tidal transport module', () => {
  it('retries once on 401 for session-based requests', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const getSession = vi.fn().mockResolvedValue({
      accessToken: 'tidal-token',
      accessTokenExpires: Date.now() + 60_000,
    });

    const transport = createTidalTransport({ fetchImpl, getSession });
    const response = await transport.executeWithSession('/users/me', { method: 'GET' }, undefined);

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(getSession).toHaveBeenCalledTimes(2);

    const firstCallInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const firstHeaders = firstCallInit.headers as Headers;
    expect(firstHeaders.get('Authorization')).toBe('Bearer tidal-token');
    expect(firstHeaders.get('Accept')).toBe('application/vnd.api+json');
  });

  it('adds JSON:API content type on token-scoped requests with body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(200, { ok: true }));
    const transport = createTidalTransport({ fetchImpl, getSession: vi.fn() });

    const response = await transport.executeWithAccessToken(
      'token-123',
      '/playlists',
      { method: 'POST', body: JSON.stringify({ test: true }) },
      undefined,
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('Accept')).toBe('application/vnd.api+json');
    expect(headers.get('Content-Type')).toBe('application/vnd.api+json');
    expect(headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('adds idempotency key on session-scoped mutation requests', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(200, { ok: true }));
    const getSession = vi.fn().mockResolvedValue({
      accessToken: 'tidal-token',
      accessTokenExpires: Date.now() + 60_000,
    });

    const transport = createTidalTransport({ fetchImpl, getSession });

    await transport.executeWithSession(
      '/playlists/test/relationships/items',
      { method: 'PATCH', body: JSON.stringify({ data: [] }) },
      undefined,
    );

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('builds playlist item page URL with encoded playlist id', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(200, { data: [] }));
    const getSession = vi.fn().mockResolvedValue({ accessToken: 'token' });
    const transport = createTidalTransport({ fetchImpl, getSession });

    await transport.fetchPlaylistItemsPage('playlist/with slash');

    const url = fetchImpl.mock.calls[0]?.[0] as string;
    expect(url).toBe('https://openapi.tidal.com/v2/playlists/playlist%2Fwith%20slash/relationships/items?include=items,items.artists,items.albums');
  });

  it('follows next cursor when collecting playlist item references', async () => {
    const firstPage = {
      data: [{ id: 'track-1', type: 'tracks', meta: { itemId: 'item-1' } }],
      links: {
        next: 'https://openapi.tidal.com/v2/playlists/pl/relationships/items?page[cursor]=abc',
      },
    };

    const secondPage = {
      data: [{ id: 'track-2', type: 'tracks' }],
      links: {},
    };

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResponse(200, firstPage))
      .mockResolvedValueOnce(makeResponse(200, secondPage));

    const getSession = vi.fn().mockResolvedValue({ accessToken: 'token' });
    const transport = createTidalTransport({ fetchImpl, getSession });

    const refs = await transport.fetchAllPlaylistItemReferences('pl');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(refs).toEqual([
      { id: 'track-1', type: 'tracks', itemId: 'item-1' },
      { id: 'track-2', type: 'tracks' },
    ]);
  });

  it('throws a descriptive error when playlist item page fetch fails', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('boom', { status: 500, statusText: 'Internal Server Error' }));
    const getSession = vi.fn().mockResolvedValue({ accessToken: 'token' });
    const transport = createTidalTransport({ fetchImpl, getSession });

    await expect(transport.fetchPlaylistItemsPage('pl')).rejects.toThrow(
      'fetchPlaylistItemsPage failed: 500 Internal Server Error boom',
    );
  });
});
