import { describe, expect, it, vi } from 'vitest';
import { createTidalProvider } from '@/lib/music-provider/tidal/provider';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/vnd.api+json' },
  });
}

function createProvider(fetchImpl: typeof fetch) {
  return createTidalProvider({
    fetchImpl,
    getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
  });
}

/** Shape returned by GET /searchResults?filter[query]=... */
const searchDocument = {
  data: [{
    id: 'opaque-search-id',
    type: 'searchResults',
    attributes: { query: 'be my lover' },
    relationships: {
      tracks: { data: [{ id: '2', type: 'tracks' }, { id: '1', type: 'tracks' }] },
      artists: { data: [{ id: 'a1', type: 'artists' }] },
    },
  }],
  included: [
    {
      id: '1',
      type: 'tracks',
      attributes: { title: 'Be My Lover (Remix)', duration: 'PT3M0S', isrc: 'X2' },
      relationships: { artists: { data: [{ id: 'a1', type: 'artists' }] } },
    },
    {
      id: '2',
      type: 'tracks',
      attributes: { title: 'Be My Lover', duration: 'PT4M2S', isrc: 'DED160200012' },
      relationships: { artists: { data: [{ id: 'a1', type: 'artists' }] } },
    },
    { id: 'a1', type: 'artists', attributes: { name: 'La Bouche' } },
  ],
};

describe('tidal search', () => {
  it('queries /searchResults with filter[query] and keeps relationship order', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(searchDocument));
    const provider = createProvider(fetchImpl);

    const result = await provider.searchTracks('be my lover la bouche', 20);

    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.pathname.endsWith('/searchResults')).toBe(true);
    expect(url.searchParams.get('filter[query]')).toBe('be my lover la bouche');
    expect(result.tracks.map((track) => track.id)).toEqual(['2', '1']);
    expect(result.tracks[0]!.name).toBe('Be My Lover');
    expect(result.tracks[0]!.artists).toEqual(['La Bouche']);
  });

  it('maps artist search results from the searchResults relationship', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(searchDocument));
    const provider = createProvider(fetchImpl);

    const result = await provider.searchArtists('la bouche');

    expect(result.artists.map((artist) => artist.name)).toEqual(['La Bouche']);
  });

  it('returns no tracks when the search has no results', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [], included: [] }));
    const provider = createProvider(fetchImpl);

    const result = await provider.searchTracks('nothing', 20);

    expect(result.tracks).toEqual([]);
  });
});
