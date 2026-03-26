import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlaylistSelectionMenu } from '@features/split-editor/playlist/hooks/usePlaylistSelectionMenu';
import type { Track } from '@/lib/music-provider/types';

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

describe('usePlaylistSelectionMenu', () => {
  it('does nothing when selection context is missing', () => {
    const openContextMenu = vi.fn();

    const state = {
      playlistId: 'playlist-1',
      isEditable: true,
      activeMarkerIndices: new Set<number>(),
      selection: new Set<string>(),
      focusedIndex: null,
      filteredTracks: [],
      selectionKey: () => '',
      getFirstSelectedTrack: () => null,
      getSelectionBounds: () => null,
      clearSelection: vi.fn(),
      handleDeleteSelected: vi.fn(),
      buildReorderActions: vi.fn(() => ({})),
      handleToggleLiked: vi.fn(),
      isLiked: vi.fn(() => false),
      isDuplicate: vi.fn(() => false),
      handleDeleteTrackDuplicates: vi.fn(),
    };

    const { result } = renderHook(() =>
      usePlaylistSelectionMenu({
        panelId: 'panel-1',
        state,
        openContextMenu,
        togglePoint: vi.fn(),
        hasActiveMarkers: false,
        handleAddToAllMarkers: vi.fn(),
      })
    );

    result.current({ x: 1, y: 2 });
    expect(openContextMenu).not.toHaveBeenCalled();
  });

  it('prefers focused selected track and exposes multi-select actions', () => {
    const trackA = createTrack('a', 0);
    const trackB = createTrack('b', 1);
    const selection = new Set(['a::0', 'b::1']);

    const openContextMenu = vi.fn();
    const togglePoint = vi.fn();
    const handleAddToAllMarkers = vi.fn();
    const handleToggleLiked = vi.fn();

    const state = {
      playlistId: 'playlist-1',
      isEditable: true,
      activeMarkerIndices: new Set<number>([0, 2]),
      selection,
      focusedIndex: 1,
      filteredTracks: [trackA, trackB],
      selectionKey: (track: Track, index: number) => `${track.id}::${index}`,
      getFirstSelectedTrack: () => ({ track: trackA }),
      getSelectionBounds: () => ({ firstPosition: 0, lastPosition: 1 }),
      clearSelection: vi.fn(),
      handleDeleteSelected: vi.fn(),
      buildReorderActions: vi.fn(() => ({ moveTop: vi.fn() })),
      handleToggleLiked,
      isLiked: vi.fn((trackId: string) => trackId === 'a'),
      isDuplicate: vi.fn(() => false),
      handleDeleteTrackDuplicates: vi.fn(),
    };

    const { result } = renderHook(() =>
      usePlaylistSelectionMenu({
        panelId: 'panel-1',
        state,
        openContextMenu,
        togglePoint,
        hasActiveMarkers: true,
        handleAddToAllMarkers,
      })
    );

    result.current({ x: 10, y: 20 });

    expect(openContextMenu).toHaveBeenCalledTimes(1);
    const args = openContextMenu.mock.calls[0]?.[0];
    expect(args.track.id).toBe('b');
    expect(args.isMultiSelect).toBe(true);
    expect(args.selectedCount).toBe(2);

    args.trackActions.onLikeAll?.();
    expect(handleToggleLiked).toHaveBeenCalledWith('b', false);

    args.markerActions.onAddMarkerBefore?.();
    expect(togglePoint).toHaveBeenCalledWith('playlist-1', 0);

    args.markerActions.onAddToAllMarkers?.();
    expect(handleAddToAllMarkers).toHaveBeenCalled();
  });
});
