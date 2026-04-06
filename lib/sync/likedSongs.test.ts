import { describe, expect, it } from 'vitest';

import {
  isLikedSongsPlaylist,
  LIKED_SONGS_PLAYLIST_ID,
  LIKED_TRACKS_BATCH_SIZE,
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

