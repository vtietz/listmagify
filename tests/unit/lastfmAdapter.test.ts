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
