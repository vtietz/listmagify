import { describe, expect, it } from 'vitest';
import { mapPlaylist, mapPlaylistItemToTrack } from '@/lib/spotify/types';

describe('spotify type mappers', () => {
  it('maps playlist metadata fields', () => {
    const playlist = mapPlaylist({
      id: 'pl-1',
      name: 'My Playlist',
      owner: { display_name: 'Owner' },
      tracks: { total: 9 },
      public: true,
      collaborative: false,
      images: [{ url: 'https://img', width: 10, height: 10 }],
    });

    expect(playlist.id).toBe('pl-1');
    expect(playlist.ownerName).toBe('Owner');
    expect(playlist.tracksTotal).toBe(9);
    expect(playlist.image?.url).toBe('https://img');
  });

  it('maps unavailable track payloads safely', () => {
    const track = mapPlaylistItemToTrack({ track: null, added_at: '2026-01-01' });

    expect(track.id).toBeNull();
    expect(track.name).toBe('[Unavailable Track]');
    expect(track.addedAt).toBe('2026-01-01');
  });

  it('maps normal track payloads with artist and album data', () => {
    const track = mapPlaylistItemToTrack({
      track: {
        id: 't-1',
        uri: 'spotify:track:t-1',
        name: 'Track',
        artists: [{ id: 'a-1', name: 'Artist' }],
        duration_ms: 123,
        album: { id: 'al-1', name: 'Album', images: [{ url: 'https://a' }] },
        popularity: 50,
        explicit: true,
      },
      added_by: { id: 'u-1', display_name: 'User' },
    });

    expect(track.id).toBe('t-1');
    expect(track.artistObjects?.[0]?.name).toBe('Artist');
    expect(track.album?.name).toBe('Album');
    expect(track.popularity).toBe(50);
    expect(track.explicit).toBe(true);
  });
});
