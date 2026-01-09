/**
 * Hook for managing sortable row state and drag data.
 * Wraps @dnd-kit/sortable's useSortable with track-specific logic.
 */

'use client';

import { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { makeCompositeId, getTrackPosition } from '@/lib/dnd/id';
import type { Track } from '@/lib/spotify/types';

// ============================================================================
// Types
// ============================================================================

interface StandardDragData {
  type: 'track';
  trackId: string;
  track: Track;
  panelId?: string | undefined;
  playlistId?: string | undefined;
  position: number;
  /** Selected tracks for browse panels (search, recommendations) */
  selectedTracks?: Track[] | undefined;
}

interface LastfmDragData {
  type: 'lastfm-track';
  track: { artistName: string; trackName: string; albumName?: string | undefined } | undefined;
  matchedTrack: { id: string; uri: string; name: string; artist?: string | undefined; durationMs?: number | undefined } | null | undefined;
  selectedMatchedUris?: string[] | undefined;
  panelId?: string | undefined;
  position: number;
  /** Selected matched tracks for Last.fm browse panel */
  selectedTracks?: Track[] | undefined;
}

export type RowDragData = StandardDragData | LastfmDragData;

interface UseRowSortableOptions {
  /** The track being rendered */
  track: Track;
  /** Visual index in the list */
  index: number;
  /** Panel ID for composite ID generation */
  panelId?: string | undefined;
  /** Playlist ID for drag data */
  playlistId?: string | undefined;
  /** Whether drag is disabled (e.g., panel is locked) */
  disabled: boolean;
  /** Type of drag data to generate */
  dragType: 'track' | 'lastfm-track';
  /** Matched Spotify track for Last.fm drag (required when dragType is 'lastfm-track') */
  matchedTrack?: { id: string; uri: string; name: string; artist?: string | undefined; durationMs?: number | undefined } | null | undefined;
  /** Original Last.fm track DTO for drag data */
  lastfmDto?: { artistName: string; trackName: string; albumName?: string | undefined } | undefined;
  /** All selected tracks' matched URIs for multi-select Last.fm drag */
  selectedMatchedUris?: string[] | undefined;
  /** All selected tracks for multi-select drag (browse panels) */
  selectedTracks?: Track[] | undefined;
  /** Callback when drag starts (used to trigger Last.fm matching) */
  onDragStart?: (() => void) | undefined;
}

interface UseRowSortableReturn {
  /** The composite ID used for sorting */
  compositeId: string;
  /** The track ID (without position) */
  trackId: string;
  /** The global position in the playlist */
  position: number;
  /** Whether this item is currently being dragged */
  isDragging: boolean;
  /** Ref to attach to the sortable element */
  setNodeRef: (node: HTMLElement | null) => void;
  /** Spread these on the sortable element (excluding role) */
  attributes: Omit<ReturnType<typeof useSortable>['attributes'], 'role'>;
  /** Spread these on the sortable element for drag events (wrapped with onDragStart if provided) */
  listeners: ReturnType<typeof useSortable>['listeners'];
}

/**
 * Hook to manage sortable row state and generate appropriate drag data.
 * Creates a globally unique composite ID scoped by panel and position to
 * distinguish duplicate tracks (same song multiple times in a playlist).
 */
export function useRowSortable({
  track,
  index,
  panelId,
  playlistId,
  disabled,
  dragType,
  matchedTrack,
  lastfmDto,
  selectedMatchedUris,
  selectedTracks,
  onDragStart,
}: UseRowSortableOptions): UseRowSortableReturn {
  // Create globally unique composite ID scoped by panel and position
  const trackId = track.id || track.uri;
  const position = getTrackPosition(track, index);
  const compositeId = panelId ? makeCompositeId(panelId, trackId, position) : trackId;

  // Build drag data based on type
  const dragData: RowDragData = useMemo((): RowDragData => {
    if (dragType === 'lastfm-track') {
      return {
        type: 'lastfm-track' as const,
        track: lastfmDto,
        matchedTrack,
        selectedMatchedUris,
        selectedTracks,
        panelId,
        position,
      };
    }
    return {
      type: 'track' as const,
      trackId,
      track,
      panelId,
      playlistId,
      position,
      selectedTracks,
    };
  }, [dragType, lastfmDto, matchedTrack, selectedMatchedUris, selectedTracks, panelId, position, trackId, track, playlistId]);

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: compositeId,
    disabled,
    animateLayoutChanges: () => false, // Disable "make room" animation
    data: dragData,
  });

  // Remove role from attributes (we manage it ourselves)
  const { role: _attrRole, ...restAttributes } = attributes;

  // Wrap listeners to trigger onDragStart callback (for Last.fm matching)
  const wrappedListeners = useMemo(() => {
    if (!onDragStart || !listeners) return listeners;
    
    const { onPointerDown, ...rest } = listeners;
    return {
      ...rest,
      onPointerDown: (e: React.PointerEvent) => {
        onDragStart();
        onPointerDown?.(e);
      },
    };
  }, [listeners, onDragStart]);

  return {
    compositeId,
    trackId,
    position,
    isDragging,
    setNodeRef,
    attributes: restAttributes,
    listeners: wrappedListeners,
  };
}
