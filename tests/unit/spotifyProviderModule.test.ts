import { describe, expect, it, vi } from 'vitest';
import { createSpotifyProvider } from '@/lib/music-provider/spotify/provider';

function makeResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('spotify provider module', () => {
  it('blocks real Spotify base URL in E2E mode', async () => {
    const originalE2EMode = process.env.E2E_MODE;
    process.env.E2E_MODE = '1';

    try {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(200, { ok: true }));
      const provider = createSpotifyProvider({
        fetchImpl,
        getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
      });

      await expect(
        provider.fetch('/me', { method: 'GET' }, { baseUrl: 'https://api.spotify.com/v1' })
      ).rejects.toThrow('blocked in E2E mode');
    } finally {
      process.env.E2E_MODE = originalE2EMode;
    }
  });

  it('allows mock Spotify base URL in E2E mode', async () => {
    const originalE2EMode = process.env.E2E_MODE;
    process.env.E2E_MODE = '1';

    try {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(200, { ok: true }));
      const provider = createSpotifyProvider({
        fetchImpl,
        getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
      });

      const response = await provider.fetch('/me', { method: 'GET' }, { baseUrl: 'http://spotify-mock:8080/v1' });
      expect(response.status).toBe(200);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      process.env.E2E_MODE = originalE2EMode;
    }
  });

  it('retries once on 401 for session-based fetch', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const getSession = vi.fn().mockResolvedValue({
      accessToken: 'token',
      accessTokenExpires: Date.now() + 60_000,
    });

    const provider = createSpotifyProvider({ fetchImpl, getSession });
    const response = await provider.fetch('/me', { method: 'GET' });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('does not retry token-scoped fetchWithToken on 401', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeResponse(401, { error: 'expired' }));

    const provider = createSpotifyProvider({ fetchImpl, getSession: vi.fn() });
    const response = await provider.fetchWithToken('token', '/me', { method: 'GET' });

    expect(response.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws useful error for getJSON non-2xx', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('bad', { status: 500 }));

    const provider = createSpotifyProvider({
      fetchImpl,
      getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
    });

    await expect(provider.getJSON('/me')).rejects.toThrow('[spotify] GET /me failed: 500');
  });
});
