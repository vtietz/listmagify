import { describe, expect, it } from 'vitest';

import {
  getLikedSongsDisplayName,
  isLikedSongsPlaylist,
  LIKED_SONGS_PLAYLIST_ID,
  LIKED_TRACKS_BATCH_SIZE,
  uriToTrackId,
} from './likedSongs';

describe('LIKED_TRACKS_BATCH_SIZE', () => {
  it('equals 50', () => {
    expect(LIKED_TRACKS_BATCH_SIZE).toBe(50);
  });
});

describe('isLikedSongsPlaylist', () => {
  it('returns true for the liked-songs sentinel ID', () => {
    expect(isLikedSongsPlaylist(LIKED_SONGS_PLAYLIST_ID)).toBe(true);
    expect(isLikedSongsPlaylist('liked')).toBe(true);
  });

  it('returns false for null', () => {
    expect(isLikedSongsPlaylist(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isLikedSongsPlaylist(undefined)).toBe(false);
  });

  it('returns false for other strings', () => {
    expect(isLikedSongsPlaylist('')).toBe(false);
    expect(isLikedSongsPlaylist('some-playlist-id')).toBe(false);
    expect(isLikedSongsPlaylist('Liked')).toBe(false);
  });
});

describe('uriToTrackId', () => {
  it('strips the spotify:track: prefix for spotify URIs', () => {
    expect(uriToTrackId('spotify', 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh')).toBe(
      '4iV5W9uYEdYUVa79Axb7Rh',
    );
  });

  it('passes through plain IDs for spotify', () => {
    expect(uriToTrackId('spotify', '4iV5W9uYEdYUVa79Axb7Rh')).toBe(
      '4iV5W9uYEdYUVa79Axb7Rh',
    );
  });

  it('passes through TIDAL IDs unchanged', () => {
    expect(uriToTrackId('tidal', '12345678')).toBe('12345678');
  });

  it('passes through TIDAL IDs even if they look like spotify URIs', () => {
    expect(uriToTrackId('tidal', 'spotify:track:fake')).toBe('spotify:track:fake');
  });
});

describe('getLikedSongsDisplayName', () => {
  it('returns "Liked Songs" for spotify', () => {
    expect(getLikedSongsDisplayName('spotify')).toBe('Liked Songs');
  });

  it('returns "My Tracks" for tidal', () => {
    expect(getLikedSongsDisplayName('tidal')).toBe('My Tracks');
  });
});
