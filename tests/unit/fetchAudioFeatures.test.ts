import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchAudioFeatures } from '@/lib/spotify/fetchers';
import * as cache from '@/lib/cache/audioFeaturesCache';
import * as client from '@/lib/spotify/client';

// Mock the cache module
vi.mock('@/lib/cache/audioFeaturesCache', () => ({
  batchGetCached: vi.fn(),
  batchSetCached: vi.fn(),
}));

// Mock the Spotify client
vi.mock('@/lib/spotify/client', () => ({
  getJSON: vi.fn(),
  spotifyFetch: vi.fn(),
}));

const mockAudioFeatures = {
  tempo: 120.5,
  key: 5,
  mode: 1,
  acousticness: 0.25,
  energy: 0.75,
  instrumentalness: 0.01,
  liveness: 0.15,
  valence: 0.65,
};

describe('fetchAudioFeatures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty map for empty input', async () => {
    const result = await fetchAudioFeatures([]);
    expect(result.size).toBe(0);
    expect(cache.batchGetCached).not.toHaveBeenCalled();
  });

  it('should return cached features without API call', async () => {
    const cachedFeatures = new Map([
      ['track1', mockAudioFeatures],
      ['track2', { ...mockAudioFeatures, tempo: 130 }],
    ]);
    
    vi.mocked(cache.batchGetCached).mockReturnValue(cachedFeatures);

    const result = await fetchAudioFeatures(['track1', 'track2']);

    expect(result.size).toBe(2);
    expect(result.get('track1')).toEqual(mockAudioFeatures);
    expect(result.get('track2')).toEqual({ ...mockAudioFeatures, tempo: 130 });
    expect(cache.batchGetCached).toHaveBeenCalledWith(['track1', 'track2']);
    expect(client.getJSON).not.toHaveBeenCalled();
  });

  it('should fetch missing tracks from API', async () => {
    const cachedFeatures = new Map([['track1', mockAudioFeatures]]);
    vi.mocked(cache.batchGetCached).mockReturnValue(cachedFeatures);

    const apiResponse = {
      audio_features: [
        {
          id: 'track2',
          tempo: 130,
          key: 7,
          mode: 0,
          acousticness: 0.3,
          energy: 0.8,
          instrumentalness: 0.02,
          liveness: 0.2,
          valence: 0.7,
        },
      ],
    };
    vi.mocked(client.getJSON).mockResolvedValue(apiResponse);

    const result = await fetchAudioFeatures(['track1', 'track2']);

    expect(result.size).toBe(2);
    expect(result.get('track1')).toEqual(mockAudioFeatures); // from cache
    expect(result.get('track2')).toEqual({
      tempo: 130,
      key: 7,
      mode: 0,
      acousticness: 0.3,
      energy: 0.8,
      instrumentalness: 0.02,
      liveness: 0.2,
      valence: 0.7,
    }); // from API
    expect(client.getJSON).toHaveBeenCalledWith('/audio-features?ids=track2');
    expect(cache.batchSetCached).toHaveBeenCalledWith(
      expect.objectContaining({
        size: 1,
      })
    );
  });

  it('should handle null responses from API (tracks without features)', async () => {
    vi.mocked(cache.batchGetCached).mockReturnValue(new Map());

    const apiResponse = {
      audio_features: [
        {
          id: 'track1',
          tempo: 120,
          key: 5,
          mode: 1,
          acousticness: 0.25,
          energy: 0.75,
          instrumentalness: 0.01,
          liveness: 0.15,
          valence: 0.65,
        },
        null, // track2 has no audio features
        {
          id: 'track3',
          tempo: 140,
          key: 9,
          mode: 1,
          acousticness: 0.15,
          energy: 0.85,
          instrumentalness: 0.5,
          liveness: 0.1,
          valence: 0.6,
        },
      ],
    };
    vi.mocked(client.getJSON).mockResolvedValue(apiResponse);

    const result = await fetchAudioFeatures(['track1', 'track2', 'track3']);

    expect(result.size).toBe(2);
    expect(result.has('track1')).toBe(true);
    expect(result.has('track2')).toBe(false); // null from API
    expect(result.has('track3')).toBe(true);
  });

  it('should batch API requests for >100 tracks', async () => {
    vi.mocked(cache.batchGetCached).mockReturnValue(new Map());

    // Generate 250 track IDs
    const trackIds = Array.from({ length: 250 }, (_, i) => `track${i}`);

    // Mock API responses for 3 batches (100 + 100 + 50)
    const mockResponse = (start: number, count: number) => ({
      audio_features: Array.from({ length: count }, (_, i) => ({
        id: `track${start + i}`,
        tempo: 120 + i,
        key: i % 12,
        mode: i % 2,
        acousticness: 0.5,
        energy: 0.5,
        instrumentalness: 0.5,
        liveness: 0.5,
        valence: 0.5,
      })),
    });

    vi.mocked(client.getJSON)
      .mockResolvedValueOnce(mockResponse(0, 100))
      .mockResolvedValueOnce(mockResponse(100, 100))
      .mockResolvedValueOnce(mockResponse(200, 50));

    const result = await fetchAudioFeatures(trackIds);

    expect(result.size).toBe(250);
    expect(client.getJSON).toHaveBeenCalledTimes(3);

    // Verify first batch
    const firstCall = vi.mocked(client.getJSON).mock.calls[0][0];
    expect(firstCall).toContain('track0');
    expect(firstCall).toContain('track99');
    expect(firstCall).not.toContain('track100');

    // Verify cache was updated
    expect(cache.batchSetCached).toHaveBeenCalled();
  });

  it('should continue on API error for one batch', async () => {
    vi.mocked(cache.batchGetCached).mockReturnValue(new Map());

    // Generate 150 track IDs (2 batches)
    const trackIds = Array.from({ length: 150 }, (_, i) => `track${i}`);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // First batch fails, second succeeds
    vi.mocked(client.getJSON)
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce({
        audio_features: Array.from({ length: 50 }, (_, i) => ({
          id: `track${100 + i}`,
          tempo: 120,
          key: 5,
          mode: 1,
          acousticness: 0.5,
          energy: 0.5,
          instrumentalness: 0.5,
          liveness: 0.5,
          valence: 0.5,
        })),
      });

    const result = await fetchAudioFeatures(trackIds);

    // Should have features from second batch only
    expect(result.size).toBe(50);
    expect(result.has('track0')).toBe(false);
    expect(result.has('track100')).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should merge cached and fetched results correctly', async () => {
    const cachedFeatures = new Map([
      ['track1', mockAudioFeatures],
      ['track3', { ...mockAudioFeatures, tempo: 140 }],
    ]);
    vi.mocked(cache.batchGetCached).mockReturnValue(cachedFeatures);

    const apiResponse = {
      audio_features: [
        {
          id: 'track2',
          tempo: 130,
          key: 7,
          mode: 0,
          acousticness: 0.3,
          energy: 0.8,
          instrumentalness: 0.02,
          liveness: 0.2,
          valence: 0.7,
        },
        {
          id: 'track4',
          tempo: 150,
          key: 9,
          mode: 1,
          acousticness: 0.1,
          energy: 0.9,
          instrumentalness: 0.8,
          liveness: 0.3,
          valence: 0.8,
        },
      ],
    };
    vi.mocked(client.getJSON).mockResolvedValue(apiResponse);

    const result = await fetchAudioFeatures(['track1', 'track2', 'track3', 'track4']);

    expect(result.size).toBe(4);
    expect(result.get('track1')?.tempo).toBe(120.5); // cached
    expect(result.get('track2')?.tempo).toBe(130); // fetched
    expect(result.get('track3')?.tempo).toBe(140); // cached
    expect(result.get('track4')?.tempo).toBe(150); // fetched
  });

  it('should only cache fetched results, not re-cache cached items', async () => {
    const cachedFeatures = new Map([['track1', mockAudioFeatures]]);
    vi.mocked(cache.batchGetCached).mockReturnValue(cachedFeatures);

    const apiResponse = {
      audio_features: [
        {
          id: 'track2',
          tempo: 130,
          key: 7,
          mode: 0,
          acousticness: 0.3,
          energy: 0.8,
          instrumentalness: 0.02,
          liveness: 0.2,
          valence: 0.7,
        },
      ],
    };
    vi.mocked(client.getJSON).mockResolvedValue(apiResponse);

    await fetchAudioFeatures(['track1', 'track2']);

    // Should only cache track2 (the fetched one)
    const setCachedCall = vi.mocked(cache.batchSetCached).mock.calls[0][0];
    expect(setCachedCall.size).toBe(1);
    expect(setCachedCall.has('track2')).toBe(true);
    expect(setCachedCall.has('track1')).toBe(false);
  });

  it('should handle all API failures gracefully', async () => {
    vi.mocked(cache.batchGetCached).mockReturnValue(new Map());
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(client.getJSON).mockRejectedValue(new Error('API unavailable'));

    const result = await fetchAudioFeatures(['track1', 'track2']);

    expect(result.size).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(cache.batchSetCached).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should properly encode track IDs in API request', async () => {
    vi.mocked(cache.batchGetCached).mockReturnValue(new Map());

    const trackIds = ['track-1', 'track:2', 'track/3'];
    
    vi.mocked(client.getJSON).mockResolvedValue({ audio_features: [] });

    await fetchAudioFeatures(trackIds);

    const apiCall = vi.mocked(client.getJSON).mock.calls[0][0];
    expect(apiCall).toContain('/audio-features?ids=');
    // Should be URL-encoded
    expect(apiCall).toContain('track-1');
  });
});
