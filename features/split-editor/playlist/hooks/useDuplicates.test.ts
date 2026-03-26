import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDuplicates } from '@features/split-editor/playlist/hooks/useDuplicates';
import type { Track } from '@/lib/music-provider/types';

vi.mock('@/lib/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function createTrack(id: string, position: number): Track {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: `Track ${id}`,
    artists: ['Artist'],
    artistObjects: [{ id: null, name: 'Artist' }],
    durationMs: 180000,
    position,
  };
}

describe('useDuplicates', () => {
  const mutateAsync = vi.fn<
    (params: {
      playlistId: string;
      tracks: Array<{ uri: string; position?: number; positions?: number[] }>;
      snapshotId?: string;
    }) => Promise<void>
  >();

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue(undefined);
  });

  it('handleDeleteAllDuplicates removes only later occurrences via positions arrays', async () => {
    const filteredTracks: Track[] = [
      createTrack('track1', 0),
      createTrack('track2', 1),
      createTrack('track1', 2),
      createTrack('track1', 3),
    ];

    const { result } = renderHook(() =>
      useDuplicates({
        playlistId: 'playlist-1',
        providerId: 'spotify',
        isEditable: true,
        filteredTracks,
        selection: new Set<string>(),
        removeTracks: { mutateAsync },
      })
    );

    await act(async () => {
      await result.current.handleDeleteAllDuplicates();
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      playlistId: 'playlist-1',
      providerId: 'spotify',
      tracks: [{ uri: 'spotify:track:track1', positions: [2, 3] }],
    });
  });

  it('handleDeleteTrackDuplicates keeps provided position and removes other positions', async () => {
    const filteredTracks: Track[] = [
      createTrack('track1', 0),
      createTrack('track2', 1),
      createTrack('track1', 2),
      createTrack('track1', 3),
    ];

    const { result } = renderHook(() =>
      useDuplicates({
        playlistId: 'playlist-1',
        providerId: 'spotify',
        isEditable: true,
        filteredTracks,
        selection: new Set<string>(),
        removeTracks: { mutateAsync },
      })
    );

    await act(async () => {
      await result.current.handleDeleteTrackDuplicates(filteredTracks[2]!, 2);
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      playlistId: 'playlist-1',
      providerId: 'spotify',
      tracks: [{ uri: 'spotify:track:track1', positions: [0, 3] }],
    });
  });
});
