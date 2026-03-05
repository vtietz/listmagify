/**
 * Unit tests for Last.fm importer adapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getLastfmConfig,
  isLastfmAvailable,
  fetchRecentTracks,
  fetchLovedTracks,
  fetchTopTracks,
  fetchWeeklyChart,
  fetchLastfmTracks,
  __lastfmTestUtils,
} from '@/lib/importers/lastfm';

// Mock environment variables
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  // Reset env
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('lastfm adapter', () => {
  describe('helper utilities', () => {
    it('computeRetryWaitMs prefers Retry-After when valid', () => {
      expect(__lastfmTestUtils.computeRetryWaitMs(0, '3')).toBe(3000);
      expect(__lastfmTestUtils.computeRetryWaitMs(2, '1')).toBe(1000);
    });

    it('computeRetryWaitMs falls back to exponential backoff', () => {
      expect(__lastfmTestUtils.computeRetryWaitMs(0)).toBe(1000);
      expect(__lastfmTestUtils.computeRetryWaitMs(1)).toBe(2000);
      expect(__lastfmTestUtils.computeRetryWaitMs(2, 'invalid')).toBe(4000);
    });

    it('detectRateLimitFromStatus returns wait for 429 only', () => {
      const status429 = new Response(null, {
        status: 429,
        headers: { 'Retry-After': '2' },
      });
      const status200 = new Response(null, { status: 200 });

      expect(__lastfmTestUtils.detectRateLimitFromStatus(status429, 0)).toBe(2000);
      expect(__lastfmTestUtils.detectRateLimitFromStatus(status200, 0)).toBeNull();
    });

    it('detectRateLimitFromBody handles error 29, non-error, and invalid JSON', async () => {
      const rateLimited = new Response(JSON.stringify({ error: 29 }), { status: 200 });
      const okBody = new Response(JSON.stringify({ recenttracks: { track: [] } }), { status: 200 });
      const invalidJson = new Response('not-json', { status: 200 });

      await expect(__lastfmTestUtils.detectRateLimitFromBody(rateLimited, 1)).resolves.toBe(2000);
      await expect(__lastfmTestUtils.detectRateLimitFromBody(okBody, 1)).resolves.toBeNull();
      await expect(__lastfmTestUtils.detectRateLimitFromBody(invalidJson, 1)).resolves.toBeNull();
    });

    it('buildPaginationFromAttr parses strings and supports missing fields', () => {
      expect(
        __lastfmTestUtils.buildPaginationFromAttr(
          {
            page: '2',
            perPage: '20',
            totalPages: '10',
            total: '200',
          },
          50
        )
      ).toEqual({ page: 2, perPage: 20, totalPages: 10, totalItems: 200 });

      expect(__lastfmTestUtils.buildPaginationFromAttr(undefined, 50)).toEqual({
        page: 1,
        perPage: 50,
      });

      expect(
        __lastfmTestUtils.buildPaginationFromAttr(
          {
            page: '',
            perPage: '',
            totalPages: '',
            total: '',
          },
          25
        )
      ).toEqual({ page: 1, perPage: 25 });
    });

    it('mapRecentTrack maps playedAt, album, and nowPlaying', () => {
      const mapped = __lastfmTestUtils.mapRecentTrack({
        artist: { '#text': 'Queen' },
        name: 'Bohemian Rhapsody',
        album: { '#text': 'A Night at the Opera' },
        date: { uts: '1704067200', '#text': '1 Jan 2024' },
        url: 'https://last.fm/track/1',
        '@attr': { nowplaying: 'true' },
      });

      expect(mapped).toMatchObject({
        artistName: 'Queen',
        trackName: 'Bohemian Rhapsody',
        albumName: 'A Night at the Opera',
        playedAt: 1704067200,
        sourceUrl: 'https://last.fm/track/1',
        nowPlaying: true,
      });
    });

    it('mapLovedTrack maps date and url fields', () => {
      const mapped = __lastfmTestUtils.mapLovedTrack({
        artist: { name: 'The Beatles' },
        name: 'Hey Jude',
        date: { uts: '1704067201', '#text': '1 Jan 2024' },
        url: 'https://last.fm/track/2',
      });

      expect(mapped).toMatchObject({
        artistName: 'The Beatles',
        trackName: 'Hey Jude',
        playedAt: 1704067201,
        sourceUrl: 'https://last.fm/track/2',
      });
    });

    it('mapTopTrack maps playcount field', () => {
      const mapped = __lastfmTestUtils.mapTopTrack({
        artist: { name: 'Pink Floyd' },
        name: 'Comfortably Numb',
        playcount: '150',
        url: 'https://last.fm/track/3',
      });

      expect(mapped).toMatchObject({
        artistName: 'Pink Floyd',
        trackName: 'Comfortably Numb',
        playcount: 150,
        sourceUrl: 'https://last.fm/track/3',
      });
    });
  });

  describe('getLastfmConfig', () => {
    it('returns config from environment', () => {
      process.env.LASTFM_API_KEY = 'test-api-key';
      process.env.LASTFM_USER_AGENT = 'TestAgent/1.0';
      process.env.LASTFM_IMPORT_ENABLED = 'true';

      const config = getLastfmConfig();

      expect(config.apiKey).toBe('test-api-key');
      expect(config.userAgent).toBe('TestAgent/1.0');
      expect(config.enabled).toBe(true);
    });

    it('returns defaults when env vars not set', () => {
      delete process.env.LASTFM_API_KEY;
      delete process.env.LASTFM_USER_AGENT;
      delete process.env.LASTFM_IMPORT_ENABLED;

      const config = getLastfmConfig();

      expect(config.apiKey).toBe('');
      expect(config.userAgent).toBe('SpotifyPlaylistStudio/1.0');
      expect(config.enabled).toBe(false);
    });
  });

  describe('isLastfmAvailable', () => {
    it('returns true when enabled and API key is set', () => {
      process.env.LASTFM_API_KEY = 'test-api-key';
      process.env.LASTFM_IMPORT_ENABLED = 'true';

      expect(isLastfmAvailable()).toBe(true);
    });

    it('returns false when not enabled', () => {
      process.env.LASTFM_API_KEY = 'test-api-key';
      process.env.LASTFM_IMPORT_ENABLED = 'false';

      expect(isLastfmAvailable()).toBe(false);
    });

    it('returns false when API key is missing', () => {
      process.env.LASTFM_API_KEY = '';
      process.env.LASTFM_IMPORT_ENABLED = 'true';

      expect(isLastfmAvailable()).toBe(false);
    });
  });

  // Mock fetch responses for integration-style tests
  describe('fetch functions with mocked responses', () => {
    beforeEach(() => {
      process.env.LASTFM_API_KEY = 'test-api-key';
      process.env.LASTFM_IMPORT_ENABLED = 'true';
    });

    it('fetchRecentTracks normalizes response', async () => {
      const mockResponse = {
        recenttracks: {
          track: [
            {
              artist: { '#text': 'Queen' },
              name: 'Bohemian Rhapsody',
              album: { '#text': 'A Night at the Opera' },
              url: 'https://last.fm/track/1',
              date: { uts: '1704067200' },
            },
            {
              artist: { '#text': 'Queen' },
              name: 'We Will Rock You',
              '@attr': { nowplaying: 'true' },
            },
          ],
          '@attr': {
            user: 'testuser',
            page: '1',
            perPage: '50',
            totalPages: '10',
            total: '500',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
        status: 200,
        headers: new Headers(),
      });

      const result = await fetchRecentTracks({ username: 'testuser' });

      expect(result.tracks).toHaveLength(2);
      expect(result.tracks[0]!.artistName).toBe('Queen');
      expect(result.tracks[0]!.trackName).toBe('Bohemian Rhapsody');
      expect(result.tracks[0]!.albumName).toBe('A Night at the Opera');
      expect(result.tracks[0]!.playedAt).toBe(1704067200);
      expect(result.tracks[1]!.nowPlaying).toBe(true);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.totalPages).toBe(10);
      expect(result.source).toBe('lastfm-recent');
    });

    it('fetchLovedTracks normalizes response', async () => {
      const mockResponse = {
        lovedtracks: {
          track: [
            {
              artist: { name: 'The Beatles' },
              name: 'Hey Jude',
              url: 'https://last.fm/track/2',
              date: { uts: '1704067200' },
            },
          ],
          '@attr': {
            user: 'testuser',
            page: '1',
            perPage: '50',
            totalPages: '5',
            total: '250',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
        status: 200,
        headers: new Headers(),
      });

      const result = await fetchLovedTracks({ username: 'testuser' });

      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0]!.artistName).toBe('The Beatles');
      expect(result.tracks[0]!.trackName).toBe('Hey Jude');
      expect(result.source).toBe('lastfm-loved');
    });

    it('fetchTopTracks normalizes response with playcount', async () => {
      const mockResponse = {
        toptracks: {
          track: [
            {
              artist: { name: 'Pink Floyd' },
              name: 'Comfortably Numb',
              playcount: '150',
              url: 'https://last.fm/track/3',
            },
          ],
          '@attr': {
            user: 'testuser',
            page: '1',
            perPage: '50',
            totalPages: '2',
            total: '100',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
        status: 200,
        headers: new Headers(),
      });

      const result = await fetchTopTracks({ username: 'testuser', period: '3month' });

      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0]!.playcount).toBe(150);
      expect(result.source).toBe('lastfm-top');
    });

    it('fetchWeeklyChart normalizes response', async () => {
      const mockResponse = {
        weeklytrackchart: {
          track: [
            {
              artist: { '#text': 'Led Zeppelin' },
              name: 'Stairway to Heaven',
              playcount: '25',
            },
          ],
          '@attr': {
            user: 'testuser',
            from: '1703462400',
            to: '1704067200',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
        status: 200,
        headers: new Headers(),
      });

      const result = await fetchWeeklyChart({ username: 'testuser' });

      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0]!.artistName).toBe('Led Zeppelin');
      expect(result.tracks[0]!.playcount).toBe(25);
      expect(result.source).toBe('lastfm-weekly');
    });

    it('fetchLastfmTracks dispatches to correct function', async () => {
      const mockResponse = {
        lovedtracks: {
          track: [],
          '@attr': { user: 'test', page: '1', perPage: '50', totalPages: '0', total: '0' },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
        status: 200,
        headers: new Headers(),
      });

      const result = await fetchLastfmTracks('lastfm-loved', { username: 'testuser' });
      expect(result.source).toBe('lastfm-loved');
    });

    it('handles Last.fm error responses', async () => {
      const mockErrorResponse = {
        error: 6,
        message: 'User not found',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockErrorResponse),
        text: () => Promise.resolve(JSON.stringify(mockErrorResponse)),
        status: 200,
        headers: new Headers(),
      });

      await expect(fetchRecentTracks({ username: 'nonexistent' })).rejects.toThrow(
        'Last.fm API error: User not found'
      );
    });
  });
});
