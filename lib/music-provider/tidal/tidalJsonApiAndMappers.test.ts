import { describe, expect, it } from 'vitest';
import {
  buildIncludedIndex,
  dedupeTrackIds,
  fromTrackUri,
  toTrackUri,
  type JsonApiDocument,
  type JsonApiIdentifier,
  type JsonApiResource,
} from '@/lib/music-provider/tidal/jsonApi';
import {
  applyReorder,
  extractPlaylistItemReferences,
  mapPlaylistResource,
  mapTrackListDocument,
  mapUserResource,
} from '@/lib/music-provider/tidal/mappers';

describe('tidal jsonApi and mappers', () => {
  it('maps user resource with full name and fallback username', () => {
    const withName = mapUserResource({
      id: 'u1',
      type: 'users',
      attributes: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        username: 'adal',
      },
    });

    expect(withName).toEqual({
      id: 'u1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
    });

    const withUsernameOnly = mapUserResource({
      id: 'u2',
      type: 'users',
      attributes: {
        username: 'user-two',
      },
    });

    expect(withUsernameOnly).toEqual({
      id: 'u2',
      displayName: 'user-two',
    });
  });

  it('maps playlist resource including owner and cover artwork', () => {
    const playlist: JsonApiResource = {
      id: 'pl-1',
      type: 'playlists',
      attributes: {
        name: 'Focus Mix',
        description: 'Deep work tracks',
        numberOfItems: 42,
        accessType: 'PUBLIC',
      },
      relationships: {
        owners: { data: [{ id: 'u-owner', type: 'users' }] },
        coverArt: { data: [{ id: 'art-1', type: 'artworks' }] },
        collaborators: { data: [{ id: 'u-collab', type: 'users' }] },
      },
    };

    const included: JsonApiResource[] = [
      {
        id: 'u-owner',
        type: 'users',
        attributes: { username: 'playlist-owner' },
      },
      {
        id: 'art-1',
        type: 'artworks',
        attributes: {
          files: [{ href: 'https://cdn.example/cover.jpg', meta: { width: 640, height: 640 } }],
        },
      },
    ];

    const mapped = mapPlaylistResource(playlist, buildIncludedIndex(included));

    expect(mapped.id).toBe('pl-1');
    expect(mapped.name).toBe('Focus Mix');
    expect(mapped.description).toBe('Deep work tracks');
    expect(mapped.ownerName).toBe('playlist-owner');
    expect(mapped.owner).toEqual({ id: 'u-owner', displayName: 'playlist-owner' });
    expect(mapped.tracksTotal).toBe(42);
    expect(mapped.isPublic).toBe(true);
    expect(mapped.collaborative).toBe(true);
    expect(mapped.image).toEqual({
      url: 'https://cdn.example/cover.jpg',
      width: 640,
      height: 640,
    });
  });

  it('maps playlist owner and cover from attribute fallbacks', () => {
    const playlist: JsonApiResource = {
      id: 'pl-attrs',
      type: 'playlists',
      attributes: {
        name: 'Fallback Playlist',
        description: null,
        numberOfItems: 7,
        ownerId: 'owner-attr-id',
        ownerUsername: 'owner-from-attrs',
        squareImage: {
          id: '550e8400-e29b-41d4-a716-446655440000',
        },
      },
      relationships: {},
    };

    const mapped = mapPlaylistResource(playlist, buildIncludedIndex([]));

    expect(mapped.owner).toEqual({
      id: 'owner-attr-id',
      displayName: 'owner-from-attrs',
    });
    expect(mapped.ownerName).toBe('owner-from-attrs');
    expect(mapped.image).toEqual({
      url: 'https://resources.tidal.com/images/550e8400/e29b/41d4/a716/446655440000/640x640.jpg',
      width: 640,
      height: 640,
    });
  });

  it('maps track list document with artists, album, cover, and addedAt', () => {
    const raw: JsonApiDocument<JsonApiIdentifier[]> = {
      data: [
        {
          id: 'track-1',
          type: 'tracks',
          meta: { addedAt: '2024-01-01T00:00:00Z', itemId: 'item-1' },
        },
      ],
      included: [
        {
          id: 'track-1',
          type: 'tracks',
          attributes: {
            title: 'Song A',
            duration: 'PT3M30S',
            popularity: 0.77,
            explicit: true,
          },
          relationships: {
            artists: { data: [{ id: 'artist-1', type: 'artists' }] },
            albums: { data: [{ id: 'album-1', type: 'albums' }] },
          },
        },
        {
          id: 'artist-1',
          type: 'artists',
          attributes: { name: 'Artist A' },
        },
        {
          id: 'album-1',
          type: 'albums',
          attributes: { title: 'Album A', releaseDate: '2020-12-31' },
          relationships: {
            coverArt: { data: [{ id: 'art-2', type: 'artworks' }] },
          },
        },
        {
          id: 'art-2',
          type: 'artworks',
          attributes: {
            files: [{ href: 'https://cdn.example/album.jpg', meta: { width: 300, height: 300 } }],
          },
        },
      ],
      links: {
        next: 'https://openapi.tidal.com/v2/next-page',
      },
    };

    const page = mapTrackListDocument(raw);

    expect(page.total).toBe(1);
    expect(page.nextCursor).toBe('https://openapi.tidal.com/v2/next-page');
    expect(page.snapshotId).toBeNull();
    expect(page.tracks).toHaveLength(1);

    expect(page.tracks[0]).toMatchObject({
      id: 'track-1',
      uri: 'tidal:track:track-1',
      name: 'Song A',
      artists: ['Artist A'],
      artistObjects: [{ id: 'artist-1', name: 'Artist A' }],
      durationMs: 210000,
      addedAt: '2024-01-01T00:00:00Z',
      position: 0,
      popularity: 77,
      explicit: true,
      album: {
        id: 'album-1',
        name: 'Album A',
        releaseDate: '2020-12-31',
        image: {
          url: 'https://cdn.example/album.jpg',
          width: 300,
          height: 300,
        },
      },
    });
  });

  it('extracts playlist item references and preserves optional meta fields', () => {
    const raw: JsonApiDocument<JsonApiIdentifier[]> = {
      data: [
        { id: 't1', type: 'tracks', meta: { itemId: 'item-1', addedAt: '2024-02-01T00:00:00Z' } },
        { id: 't2', type: 'tracks' },
      ],
    };

    expect(extractPlaylistItemReferences(raw)).toEqual([
      { id: 't1', type: 'tracks', itemId: 'item-1', addedAt: '2024-02-01T00:00:00Z' },
      { id: 't2', type: 'tracks' },
    ]);
  });

  it('supports track URI conversion and deduping', () => {
    expect(toTrackUri('abc')).toBe('tidal:track:abc');
    expect(fromTrackUri('tidal:track:abc')).toBe('abc');
    expect(fromTrackUri('plain-id')).toBe('plain-id');

    expect(dedupeTrackIds(['tidal:track:1', '1', '2', 'tidal:track:2', '', '2'])).toEqual(['1', '2']);
  });

  it('applies reorder semantics and validates indexes', () => {
    const reordered = applyReorder(['a', 'b', 'c', 'd', 'e'], 1, 4, 2);
    expect(reordered).toEqual(['a', 'd', 'b', 'c', 'e']);

    expect(() => applyReorder(['a', 'b'], -1, 1)).toThrow('invalid_indexes');
    expect(() => applyReorder(['a', 'b'], 0, 3)).toThrow('invalid_indexes');
  });
});
