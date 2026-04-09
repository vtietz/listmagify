import { describe, expect, it, vi } from 'vitest';
import { getLikedTracksPage } from '@/lib/music-provider/tidal/likedTracks';
import { findTracksInUserCollection } from '@/lib/music-provider/tidal/providerInternals';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/vnd.api+json' },
  });
}

describe('TIDAL liked collection paging', () => {
  it('uses cursor pagination path for first liked-tracks page', async () => {
    const executeWithSession = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [],
        links: { next: '/userCollectionTracks/me/relationships/items?page[cursor]=abc' },
      }),
    );

    const page = await getLikedTracksPage(executeWithSession, 50);

    const firstCallPath = String(executeWithSession.mock.calls[0]?.[0] ?? '');
    expect(firstCallPath).toContain('/userCollectionTracks/me/relationships/items?');
    expect(firstCallPath).toContain('page%5Bsize%5D=50');
    expect(firstCallPath).not.toContain('page[offset]');
    expect(page.nextCursor).toBe('/userCollectionTracks/me/relationships/items?page[cursor]=abc');
  });

  it('uses provided nextCursor as-is for subsequent liked-tracks page', async () => {
    const executeWithSession = vi.fn().mockResolvedValue(
      jsonResponse({ data: [], links: { next: null } }),
    );

    await getLikedTracksPage(executeWithSession, 50, '/userCollectionTracks/me/relationships/items?page[cursor]=next-page');

    const firstCallPath = String(executeWithSession.mock.calls[0]?.[0] ?? '');
    expect(firstCallPath).toBe('/userCollectionTracks/me/relationships/items?page[cursor]=next-page');
  });

  it('scans user collection with lightweight relationship query for contains checks', async () => {
    const executeWithSession = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ id: 'track-1', type: 'tracks' }],
        links: { next: null },
      }),
    );

    const found = await findTracksInUserCollection(
      { executeWithSession },
      ['track-1'],
    );

    const firstCallPath = String(executeWithSession.mock.calls[0]?.[0] ?? '');
    expect(firstCallPath).toContain('/userCollectionTracks/me/relationships/items?page[size]=100');
    expect(firstCallPath).not.toContain('include=');
    expect(found.has('track-1')).toBe(true);
  });
});
