import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TrackPayload } from '@features/dnd/model/types';
import type { Track } from '@/lib/music-provider/types';
import { createProviderMatchingAdapter } from './providers';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  apiFetch: apiFetchMock,
}));

describe('createProviderMatchingAdapter', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('falls back to title+artist search when album-inclusive query scores too low', async () => {
    const payload: TrackPayload = {
      title: 'Sad Song',
      artists: ['Oasis'],
      normalizedArtists: ['oasis'],
      album: 'Wrong Album Name',
      durationSec: 269,
      sourceProvider: 'spotify',
    };

    const weakPrimary: Track = {
      id: 'weak-1',
      uri: 'tidal:track:weak-1',
      name: 'Sad Song',
      artists: ['Unknown Artist'],
      durationMs: 269000,
      album: { name: 'Wrong Album Name' },
    };

    const strongFallback: Track = {
      id: 'good-1',
      uri: 'tidal:track:good-1',
      name: 'Sad Song - Remastered',
      artists: ['Oasis'],
      durationMs: 269000,
      album: { name: 'Definitely Maybe' },
    };

    apiFetchMock
      .mockResolvedValueOnce({ tracks: [weakPrimary] })
      .mockResolvedValueOnce({ tracks: [strongFallback] });

    const adapter = createProviderMatchingAdapter();
    const candidates = await adapter.searchCandidates(payload, 'tidal', 3);

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(String(apiFetchMock.mock.calls[0]?.[0] ?? '')).toContain('q=Sad+Song+Oasis+Wrong+Album+Name');
    expect(String(apiFetchMock.mock.calls[1]?.[0] ?? '')).toContain('q=Sad+Song+Oasis');

    expect(candidates[0]?.trackUri).toBe('tidal:track:good-1');
  });

  it('does not run fallback search when album-inclusive query already scores high', async () => {
    const payload: TrackPayload = {
      title: 'Live Forever',
      artists: ['Oasis'],
      normalizedArtists: ['oasis'],
      album: 'Definitely Maybe',
      durationSec: 276,
      sourceProvider: 'spotify',
    };

    const strongPrimary: Track = {
      id: 'good-primary',
      uri: 'tidal:track:good-primary',
      name: 'Live Forever',
      artists: ['Oasis'],
      durationMs: 276000,
      album: { name: 'Definitely Maybe' },
    };

    apiFetchMock.mockResolvedValueOnce({ tracks: [strongPrimary] });

    const adapter = createProviderMatchingAdapter();
    const candidates = await adapter.searchCandidates(payload, 'tidal', 3);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(candidates[0]?.trackUri).toBe('tidal:track:good-primary');
  });
});
