/**
 * Unit tests for Spotify track matcher utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  sanitizeName,
  buildSearchQuery,
  buildFallbackQuery,
  stringSimilarity,
  isEffectivelyEqual,
  scoreMatch,
  getConfidence,
  createMatchResult,
  deduplicateMatches,
} from '@/lib/importers/spotifyMatcher';
import type { ImportedTrackDTO, SpotifyMatchedTrack, MatchResult } from '@/lib/importers/types';

describe('spotifyMatcher', () => {
  describe('normalizeText', () => {
    it('converts to lowercase', () => {
      expect(normalizeText('Hello World')).toBe('hello world');
    });

    it('removes diacritics', () => {
      expect(normalizeText('Café')).toBe('cafe');
      expect(normalizeText('Björk')).toBe('bjork');
    });

    it('normalizes apostrophes and quotes', () => {
      expect(normalizeText("don't")).toBe("don't");
      expect(normalizeText("don\u2019t")).toBe("don't");
    });

    it('converts ampersand to "and"', () => {
      expect(normalizeText('rock & roll')).toBe('rock and roll');
    });

    it('collapses whitespace', () => {
      expect(normalizeText('hello   world')).toBe('hello world');
    });

    it('handles empty string', () => {
      expect(normalizeText('')).toBe('');
    });
  });

  describe('sanitizeName', () => {
    it('removes remaster indicators', () => {
      expect(sanitizeName('Song - Remastered')).toBe('song');
      expect(sanitizeName('Song (Remastered 2020)')).toBe('song');
      expect(sanitizeName('Song [2015 Remaster]')).toBe('song');
    });

    it('removes live/remix indicators', () => {
      expect(sanitizeName('Song - Live')).toBe('song');
      expect(sanitizeName('Song (Remix)')).toBe('song');
      expect(sanitizeName('Song [Acoustic]')).toBe('song');
    });

    it('removes featured artist indicators', () => {
      expect(sanitizeName('Song (feat. Artist)')).toBe('song');
      expect(sanitizeName('Song feat. Artist')).toBe('song');
      expect(sanitizeName('Song (ft. Artist)')).toBe('song');
      expect(sanitizeName('Song featuring Artist')).toBe('song');
    });

    it('removes year indicators', () => {
      expect(sanitizeName('Song (2020)')).toBe('song');
      expect(sanitizeName('Song [1985]')).toBe('song');
    });

    it('keeps base track name intact', () => {
      expect(sanitizeName('Bohemian Rhapsody')).toBe('bohemian rhapsody');
      expect(sanitizeName("Don't Stop Me Now")).toBe("don't stop me now");
    });
  });

  describe('buildSearchQuery', () => {
    it('builds query with track and artist', () => {
      const track: ImportedTrackDTO = {
        trackName: 'Bohemian Rhapsody',
        artistName: 'Queen',
      };
      const query = buildSearchQuery(track);
      expect(query).toContain('track:"bohemian rhapsody"');
      expect(query).toContain('artist:"queen"');
    });

    it('includes album when requested', () => {
      const track: ImportedTrackDTO = {
        trackName: 'Bohemian Rhapsody',
        artistName: 'Queen',
        albumName: 'A Night at the Opera',
      };
      const query = buildSearchQuery(track, true);
      expect(query).toContain('album:"a night at the opera"');
    });

    it('sanitizes track names', () => {
      const track: ImportedTrackDTO = {
        trackName: 'Song (Remastered 2020)',
        artistName: 'Artist',
      };
      const query = buildSearchQuery(track);
      expect(query).toContain('track:"song"');
    });
  });

  describe('buildFallbackQuery', () => {
    it('builds simple text query', () => {
      const track: ImportedTrackDTO = {
        trackName: 'Bohemian Rhapsody',
        artistName: 'Queen',
      };
      const query = buildFallbackQuery(track);
      expect(query).toBe('bohemian rhapsody queen');
    });
  });

  describe('stringSimilarity', () => {
    it('returns 1 for identical strings', () => {
      expect(stringSimilarity('hello', 'hello')).toBe(1);
    });

    it('returns high score for similar strings', () => {
      const score = stringSimilarity('Bohemian Rhapsody', 'bohemian rhapsody');
      expect(score).toBeGreaterThan(0.9);
    });

    it('returns low score for different strings', () => {
      const score = stringSimilarity('Hello', 'Goodbye');
      expect(score).toBeLessThan(0.5);
    });

    it('handles empty strings', () => {
      // Empty strings should return low/zero similarity
      const score = stringSimilarity('', '');
      expect(score).toBeLessThanOrEqual(1);
      expect(stringSimilarity('hello', '')).toBeLessThan(1);
    });
  });

  describe('isEffectivelyEqual', () => {
    it('returns true for same text after normalization', () => {
      expect(isEffectivelyEqual('Hello World', 'hello world')).toBe(true);
      expect(isEffectivelyEqual('Café', 'cafe')).toBe(true);
    });

    it('returns true when only remaster suffix differs', () => {
      expect(isEffectivelyEqual('Song', 'Song - Remastered')).toBe(true);
      expect(isEffectivelyEqual('Song', 'Song (2020 Remaster)')).toBe(true);
    });

    it('returns false for different text', () => {
      expect(isEffectivelyEqual('Hello', 'World')).toBe(false);
    });
  });

  describe('scoreMatch', () => {
    const createImported = (overrides: Partial<ImportedTrackDTO> = {}): ImportedTrackDTO => ({
      trackName: 'Test Track',
      artistName: 'Test Artist',
      ...overrides,
    });

    const createSpotify = (overrides: Partial<SpotifyMatchedTrack> = {}): SpotifyMatchedTrack => ({
      id: 'spotify-id',
      uri: 'spotify:track:id',
      name: 'Test Track',
      artists: ['Test Artist'],
      durationMs: 200000,
      ...overrides,
    });

    it('gives high score for exact matches', () => {
      const imported = createImported();
      const spotify = createSpotify();
      const score = scoreMatch(imported, spotify);
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it('gives bonus for album match', () => {
      const imported = createImported({ albumName: 'Test Album' });
      const spotifyWithAlbum = createSpotify({ album: { id: '1', name: 'Test Album' } });
      const spotifyWithoutAlbum = createSpotify();

      const scoreWithAlbum = scoreMatch(imported, spotifyWithAlbum);
      const scoreWithoutAlbum = scoreMatch(imported, spotifyWithoutAlbum);

      expect(scoreWithAlbum).toBeGreaterThan(scoreWithoutAlbum);
    });

    it('gives bonus for popularity', () => {
      const imported = createImported();
      const spotifyPopular = createSpotify({ popularity: 100 });
      const spotifyUnpopular = createSpotify({ popularity: 0 });

      const popularScore = scoreMatch(imported, spotifyPopular);
      const unpopularScore = scoreMatch(imported, spotifyUnpopular);

      expect(popularScore).toBeGreaterThan(unpopularScore);
    });

    it('handles multiple artists', () => {
      const imported = createImported({ artistName: 'Artist A' });
      const spotify = createSpotify({ artists: ['Artist B', 'Artist A', 'Artist C'] });

      const score = scoreMatch(imported, spotify);
      expect(score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('getConfidence', () => {
    it('returns high for scores >= 80', () => {
      expect(getConfidence(80)).toBe('high');
      expect(getConfidence(100)).toBe('high');
    });

    it('returns medium for scores 60-79', () => {
      expect(getConfidence(60)).toBe('medium');
      expect(getConfidence(79)).toBe('medium');
    });

    it('returns low for scores 40-59', () => {
      expect(getConfidence(40)).toBe('low');
      expect(getConfidence(59)).toBe('low');
    });

    it('returns none for scores < 40', () => {
      expect(getConfidence(39)).toBe('none');
      expect(getConfidence(0)).toBe('none');
    });
  });

  describe('createMatchResult', () => {
    const imported: ImportedTrackDTO = {
      trackName: 'Test Track',
      artistName: 'Test Artist',
    };

    it('returns none confidence when no matches', () => {
      const result = createMatchResult(imported, []);
      expect(result.confidence).toBe('none');
      expect(result.score).toBe(0);
      expect(result.spotifyTrack).toBeUndefined();
    });

    it('selects best match and includes candidates', () => {
      const spotify1: SpotifyMatchedTrack = {
        id: '1',
        uri: 'spotify:track:1',
        name: 'Test Track',
        artists: ['Test Artist'],
        durationMs: 200000,
        popularity: 80,
      };
      const spotify2: SpotifyMatchedTrack = {
        id: '2',
        uri: 'spotify:track:2',
        name: 'Test Track - Live',
        artists: ['Test Artist'],
        durationMs: 250000,
        popularity: 30,
      };

      const result = createMatchResult(imported, [spotify1, spotify2]);
      
      expect(result.spotifyTrack).toBeDefined();
      expect(result.candidates).toBeDefined();
      expect(result.candidates!.length).toBeLessThanOrEqual(5);
    });
  });

  describe('deduplicateMatches', () => {
    it('removes duplicate Spotify tracks', () => {
      const results: MatchResult[] = [
        {
          imported: { trackName: 'Track 1', artistName: 'Artist' },
          spotifyTrack: { id: '1', uri: 'spotify:track:same', name: 'Track', artists: ['Artist'], durationMs: 200000 },
          confidence: 'high',
          score: 90,
        },
        {
          imported: { trackName: 'Track 2', artistName: 'Artist' },
          spotifyTrack: { id: '1', uri: 'spotify:track:same', name: 'Track', artists: ['Artist'], durationMs: 200000 },
          confidence: 'high',
          score: 85,
        },
      ];

      const deduplicated = deduplicateMatches(results);
      expect(deduplicated.length).toBe(1);
    });

    it('keeps unmatched results', () => {
      const results: MatchResult[] = [
        {
          imported: { trackName: 'Track 1', artistName: 'Artist' },
          confidence: 'none',
          score: 0,
        },
        {
          imported: { trackName: 'Track 2', artistName: 'Artist' },
          spotifyTrack: { id: '1', uri: 'spotify:track:1', name: 'Track', artists: ['Artist'], durationMs: 200000 },
          confidence: 'high',
          score: 90,
        },
      ];

      const deduplicated = deduplicateMatches(results);
      expect(deduplicated.length).toBe(2);
    });
  });
});
