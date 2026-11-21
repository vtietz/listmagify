import { describe, expect, it, vi } from 'vitest';
import { createSpotifyProvider } from '@/lib/music-provider/spotify/provider';
import { createTidalProvider } from '@/lib/music-provider/tidal/provider';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const getSession = () => vi.fn().mockResolvedValue({ accessToken: 'token', accessTokenExpires: Date.now() + 60_000 });

describe('tidal getTracksByIds', () => {
  it('maps primary track resources from GET /tracks?filter[id]', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      data: [
        {
          id: '280018424',
          type: 'tracks',
          attributes: { title: 'Track A', duration: 'PT3M0S' },
          relationships: { artists: { data: [{ id: 'a1', type: 'artists' }] } },
        },
        { id: '35465609', type: 'tracks', attributes: { title: 'Track B', duration: 'PT2M0S' } },
      ],
      included: [{ id: 'a1', type: 'artists', attributes: { name: 'Artist One' } }],
    }));
    const provider = createTidalProvider({ fetchImpl, getSession: getSession() });

    const tracks = await provider.getTracksByIds(['280018424', '35465609', 'not-a-tidal-id']);

    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.pathname.endsWith('/tracks')).toBe(true);
    expect(url.searchParams.get('filter[id]')).toBe('280018424,35465609');
    expect(tracks.map((track) => track.id)).toEqual(['280018424', '35465609']);
    expect(tracks[0]!.name).toBe('Track A');
    expect(tracks[0]!.artists).toEqual(['Artist One']);
  });

  it('chunks requests at 20 IDs', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ data: [] }));
    const provider = createTidalProvider({ fetchImpl, getSession: getSession() });

    await provider.getTracksByIds(Array.from({ length: 45 }, (_, i) => String(i + 1)));

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('spotify getTracksByIds', () => {
  it('fetches each valid track and skips missing ones', async () => {
    const found = '4uLU6hMCjMI75M1A2tKUQC';
    const missing = '0000000000000000000000';
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => (
      String(input).includes(found)
        ? jsonResponse({ id: found, uri: `spotify:track:${found}`, name: 'Song', artists: [{ id: 'x', name: 'Band' }] })
        : jsonResponse({ error: 'not found' }, 404)
    ));
    const provider = createSpotifyProvider({ fetchImpl, getSession: getSession() });

    const tracks = await provider.getTracksByIds([found, missing, '123456']);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(tracks.map((track) => track.id)).toEqual([found]);
    expect(tracks[0]!.artists).toEqual(['Band']);
  });
});
