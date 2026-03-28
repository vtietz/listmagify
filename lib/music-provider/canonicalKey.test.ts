import { describe, expect, it } from 'vitest';
import { getCanonicalTrackKey } from '@/lib/music-provider/canonicalKey';
import type { Track } from '@/lib/music-provider/types';

/** Helper to build a minimal Track with sensible defaults. */
function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    uri: 'spotify:track:track-1',
    name: 'Test Song',
    artists: ['Test Artist'],
    durationMs: 200000,
    ...overrides,
  };
}

describe('getCanonicalTrackKey', () => {
  it('produces a pipe-delimited key from normalized title and sorted artists', () => {
    const track = makeTrack({ name: 'My Song', artists: ['Artist A'] });
    const key = getCanonicalTrackKey(track);

    expect(key).toBe('my song|artist a');
  });

  it('strips parenthetical suffixes from the title', () => {
    const track = makeTrack({ name: 'Song (Remastered 2011)', artists: ['Artist'] });
    const key = getCanonicalTrackKey(track);

    // normalizeText removes "(Remastered 2011)" and the leftover "remastered" keyword
    expect(key).toBe('song|artist');
  });

  it('strips bracketed suffixes from the title', () => {
    const track = makeTrack({ name: 'Song [Live Version]', artists: ['Artist'] });
    const key = getCanonicalTrackKey(track);

    expect(key).toBe('song|artist');
  });

  it('sorts multiple artists alphabetically', () => {
    const track = makeTrack({ name: 'Collab', artists: ['Zara', 'Alice', 'Mika'] });
    const key = getCanonicalTrackKey(track);

    expect(key).toBe('collab|alice mika zara');
  });

  it('produces a key with empty artist segment when artists array is empty', () => {
    const track = makeTrack({ name: 'Instrumental', artists: [] });
    const key = getCanonicalTrackKey(track);

    expect(key).toBe('instrumental|');
  });

  it('handles unicode characters in title and artists', () => {
    const track = makeTrack({ name: 'Despacito', artists: ['Luis Fonsi'] });
    const key = getCanonicalTrackKey(track);

    expect(key).toBe('despacito|luis fonsi');
  });

  it('preserves non-Latin unicode letters', () => {
    const track = makeTrack({ name: 'Sakura', artists: ['Utada Hikaru'] });
    const key = getCanonicalTrackKey(track);

    // normalizeText uses \p{L} which includes all Unicode letters
    expect(key).toContain('sakura');
    expect(key).toContain('utada hikaru');
  });

  it('normalizes artist names the same way as title (strips noise keywords)', () => {
    const track = makeTrack({
      name: 'Song',
      artists: ['Artist (Remastered)'],
    });
    const key = getCanonicalTrackKey(track);

    // "Artist (Remastered)" -> normalizeText -> "artist"
    expect(key).toBe('song|artist');
  });

  it('produces the same key for the same song on different providers (cross-provider match)', () => {
    const spotifyTrack = makeTrack({
      id: 'spotify-id-123',
      uri: 'spotify:track:abc123',
      name: 'Bohemian Rhapsody',
      artists: ['Queen'],
      durationMs: 354000,
      isrc: 'GBUM71029604',
    });

    const tidalTrack = makeTrack({
      id: 'tidal-id-456',
      uri: 'tidal:track:789',
      name: 'Bohemian Rhapsody',
      artists: ['Queen'],
      durationMs: 354320,
      isrc: 'GBUM71029604',
    });

    expect(getCanonicalTrackKey(spotifyTrack)).toBe(getCanonicalTrackKey(tidalTrack));
  });

  it('produces different keys for tracks with different titles', () => {
    const trackA = makeTrack({ name: 'Song A', artists: ['Artist'] });
    const trackB = makeTrack({ name: 'Song B', artists: ['Artist'] });

    expect(getCanonicalTrackKey(trackA)).not.toBe(getCanonicalTrackKey(trackB));
  });

  it('produces different keys for tracks with different artists', () => {
    const trackA = makeTrack({ name: 'Song', artists: ['Alpha'] });
    const trackB = makeTrack({ name: 'Song', artists: ['Beta'] });

    expect(getCanonicalTrackKey(trackA)).not.toBe(getCanonicalTrackKey(trackB));
  });

  it('ignores URI differences when computing the key', () => {
    const trackA = makeTrack({ uri: 'spotify:track:abc', name: 'X', artists: ['Y'] });
    const trackB = makeTrack({ uri: 'tidal:track:999', name: 'X', artists: ['Y'] });

    expect(getCanonicalTrackKey(trackA)).toBe(getCanonicalTrackKey(trackB));
  });

  it('collapses extra whitespace in titles', () => {
    const track = makeTrack({ name: '  Hello   World  ', artists: ['A'] });
    const key = getCanonicalTrackKey(track);

    expect(key).toBe('hello world|a');
  });

  it('strips special characters from titles', () => {
    const track = makeTrack({ name: 'Rock & Roll!', artists: ['Band'] });
    const key = getCanonicalTrackKey(track);

    // "&" and "!" are non-\p{L}\p{N} so they become spaces, then collapsed
    expect(key).toBe('rock roll|band');
  });

  it('handles cross-provider match with remaster suffix differences', () => {
    const spotifyVersion = makeTrack({
      uri: 'spotify:track:aaa',
      name: 'Hotel California (Remastered)',
      artists: ['Eagles'],
    });

    const tidalVersion = makeTrack({
      uri: 'tidal:track:bbb',
      name: 'Hotel California',
      artists: ['Eagles'],
    });

    expect(getCanonicalTrackKey(spotifyVersion)).toBe(getCanonicalTrackKey(tidalVersion));
  });

  it('handles artist order differences across providers', () => {
    const spotifyVersion = makeTrack({
      uri: 'spotify:track:aaa',
      name: 'Collab Track',
      artists: ['Artist B', 'Artist A'],
    });

    const tidalVersion = makeTrack({
      uri: 'tidal:track:bbb',
      name: 'Collab Track',
      artists: ['Artist A', 'Artist B'],
    });

    expect(getCanonicalTrackKey(spotifyVersion)).toBe(getCanonicalTrackKey(tidalVersion));
  });
});
