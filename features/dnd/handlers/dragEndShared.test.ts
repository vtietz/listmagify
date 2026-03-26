import { describe, expect, it } from 'vitest';
import type { Track } from '@/lib/music-provider/types';
import type { TrackPayload } from '@features/dnd/model/types';
import type { PanelConfig } from '@features/dnd/model/types';
import { resolveCrossProviderPayloads, resolvePanelProviderId } from '@features/dnd/handlers/dragEndShared';

function createPanel(overrides: Partial<PanelConfig>): PanelConfig {
  return {
    id: 'panel-default',
    playlistId: null,
    isEditable: true,
    ...overrides,
  };
}

function createTrack(id: string, uri: string, name: string): Track {
  return {
    id,
    uri,
    name,
    artists: ['Artist'],
    durationMs: 180_000,
    album: {
      name: 'Album',
      releaseDate: '2020-01-01',
      image: { url: 'https://example.com/cover.jpg' },
    },
  };
}

function createPayload(title: string): TrackPayload {
  return {
    title,
    artists: ['Artist'],
    normalizedArtists: ['artist'],
    album: 'Album',
    durationSec: 180,
    sourceProvider: 'spotify',
    sourceProviderId: `${title}-id`,
    sourceProviderUri: `spotify:track:${title}`,
  };
}

describe('resolveCrossProviderPayloads', () => {
  it('prefers selectedTrackPayloads when provided', () => {
    const payloads = [createPayload('one'), createPayload('two')];

    const result = resolveCrossProviderPayloads(
      {
        type: 'track',
        track: createTrack('1', 'spotify:track:1', 'Track 1'),
        position: 0,
        selectedTrackPayloads: payloads,
      },
      [createTrack('1', 'spotify:track:1', 'Track 1')],
      'spotify'
    );

    expect(result).toEqual(payloads);
  });

  it('uses all dragTracks for multi-select even when single trackPayload exists', () => {
    const dragTracks = [
      createTrack('1', 'spotify:track:1', 'Track 1'),
      createTrack('2', 'spotify:track:2', 'Track 2'),
    ];

    const result = resolveCrossProviderPayloads(
      {
        type: 'track',
        track: dragTracks[0]!,
        position: 0,
        trackPayload: createPayload('single-row-payload'),
      },
      dragTracks,
      'spotify'
    );

    expect(result).toHaveLength(2);
    expect(result.map((payload) => payload.title)).toEqual(['Track 1', 'Track 2']);
  });

  it('uses row trackPayload for single-track drags', () => {
    const payload = createPayload('single');

    const result = resolveCrossProviderPayloads(
      {
        type: 'track',
        track: createTrack('1', 'spotify:track:1', 'Track 1'),
        position: 0,
        trackPayload: payload,
      },
      [createTrack('1', 'spotify:track:1', 'Track 1')],
      'spotify'
    );

    expect(result).toEqual([payload]);
  });
});

describe('resolvePanelProviderId', () => {
  it('prefers explicit panel provider for ambiguous test playlist ids', () => {
    const spotifyPanel = createPanel({
      id: 'panel-spotify',
      providerId: 'spotify',
      playlistId: 'test-playlist-1',
    });

    const tidalPanel = createPanel({
      id: 'panel-tidal',
      providerId: 'tidal',
      playlistId: 'test-playlist-2',
    });

    expect(resolvePanelProviderId(spotifyPanel, spotifyPanel.playlistId)).toBe('spotify');
    expect(resolvePanelProviderId(tidalPanel, tidalPanel.playlistId)).toBe('tidal');
  });

  it('falls back to inferred provider when panel provider is missing', () => {
    const panel = createPanel({
      id: 'panel-fallback',
      playlistId: '123e4567-e89b-12d3-a456-426614174000',
    });

    expect(resolvePanelProviderId(panel, panel.playlistId)).toBe('tidal');
  });
});
