import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTidalProvider } from '@/lib/music-provider/tidal/provider';

function response(status = 200, body: unknown = { data: [] }): Response {
  if (status === 204) {
    return new Response(null, { status });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('TIDAL v1 favorites mirror', () => {
  const previousMirror = process.env.TIDAL_V1_FAVORITES_MIRROR;

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.TIDAL_V1_FAVORITES_MIRROR = previousMirror;
  });

  it('mirrors saveTracks to v1 favorites when enabled', async () => {
    process.env.TIDAL_V1_FAVORITES_MIRROR = '1';

    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/userCollectionTracks/me/relationships/items') && init?.method === 'POST') {
        return response(200, { data: [] });
      }
      if (url.endsWith('/users/me') && init?.method === 'GET') {
        return response(200, { data: { id: '181936426', type: 'users' } });
      }
      if (url.includes('/v1/users/181936426/favorites/tracks?trackId=123') && init?.method === 'POST') {
        return response(200, {});
      }

      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    });

    const provider = createTidalProvider({
      fetchImpl,
      getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
    });

    await provider.saveTracks({ ids: ['123'] });

    expect(fetchImpl.mock.calls.some(([input, init]) => String(input).includes('/v1/users/181936426/favorites/tracks?trackId=123') && init?.method === 'POST')).toBe(true);
  });

  it('mirrors removeTracks to v1 favorites when enabled', async () => {
    process.env.TIDAL_V1_FAVORITES_MIRROR = '1';

    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/userCollectionTracks/me/relationships/items') && init?.method === 'DELETE') {
        return response(200, { data: [] });
      }
      if (url.endsWith('/users/me') && init?.method === 'GET') {
        return response(200, { data: { id: '181936426', type: 'users' } });
      }
      if (url.includes('/v1/users/181936426/favorites/tracks/123') && init?.method === 'DELETE') {
        return response(204, {});
      }

      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    });

    const provider = createTidalProvider({
      fetchImpl,
      getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
    });

    await provider.removeTracks({ ids: ['123'] });

    expect(fetchImpl.mock.calls.some(([input, init]) => String(input).includes('/v1/users/181936426/favorites/tracks/123') && init?.method === 'DELETE')).toBe(true);
  });
});
