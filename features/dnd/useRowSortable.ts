/**
 * Hook for managing draggable row state and drag data.
 * Wraps @dnd-kit/core's useDraggable with track-specific logic.
 */

'use client';

import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { makeCompositeId, getTrackPosition } from '@/lib/dnd/id';
import type { Track } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { TrackPayload } from '@features/dnd/model/types';

// ============================================================================
// Types
// ============================================================================

export interface RowDragData {
  type: 'track';
  trackId: string;
  track: Track;
  panelId?: string | undefined;
  playlistId?: string | undefined;
  position: number;
  /** Selected tracks for browse panels (search, recommendations, lastfm) */
  selectedTracks?: Track[] | undefined;
  trackPayload?: TrackPayload | undefined;
  selectedTrackPayloads?: TrackPayload[] | undefined;
}

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
  /** All selected tracks for multi-select drag (browse panels) */
  selectedTracks?: Track[] | undefined;
  /** Source provider for provider-agnostic payload generation */
  providerId?: MusicProviderId | undefined;
  /** Pre-built track payload (e.g., for LastFM tracks) */
  trackPayload?: TrackPayload | undefined;
  /** Pre-built selected track payloads (e.g., for LastFM multi-select) */
  selectedTrackPayloads?: TrackPayload[] | undefined;
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
  /** Spread these on the draggable element (excluding role) */
  attributes: Omit<ReturnType<typeof useDraggable>['attributes'], 'role'>;
  /** Spread these on the draggable element for drag events */
  listeners: ReturnType<typeof useDraggable>['listeners'];
}

function normalizeArtists(artists: string[] | undefined): string[] {
  return (artists ?? []).map((artist) => artist.trim().toLowerCase());
}

function parseReleaseYear(releaseDate: string | null | undefined): number | undefined {
  if (!releaseDate) {
    return undefined;
  }

  const parsedYear = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(parsedYear) ? parsedYear : undefined;
}

function buildTrackPayload(sourceTrack: Track, providerId?: MusicProviderId): TrackPayload {
  const artists = sourceTrack.artists ?? [];
  const payload: TrackPayload = {
    title: sourceTrack.name,
    artists,
    normalizedArtists: normalizeArtists(artists),
    album: sourceTrack.album?.name ?? null,
    durationSec: Math.max(0, Math.round((sourceTrack.durationMs ?? 0) / 1000)),
    sourceProviderId: sourceTrack.id ?? undefined,
    sourceProviderUri: sourceTrack.uri || undefined,
    coverUrl: sourceTrack.album?.image?.url,
    year: parseReleaseYear(sourceTrack.album?.releaseDate),
  };

  if (providerId) {
    payload.sourceProvider = providerId;
  }

  return payload;
}

/**
 * Hook to manage draggable row state and generate appropriate drag data.
 * Creates a globally unique composite ID scoped by panel and position to
 * distinguish duplicate tracks (same song multiple times in a playlist).
 */
export function useRowSortable({
  track,
  index,
  panelId,
  playlistId,
  disabled,
  selectedTracks,
  providerId,
  trackPayload: externalTrackPayload,
  selectedTrackPayloads: externalSelectedTrackPayloads,
}: UseRowSortableOptions): UseRowSortableReturn {
  const trackId = track.id || track.uri;
  const position = getTrackPosition(track, index);
  const compositeId = panelId ? makeCompositeId(panelId, trackId, position) : trackId;

  const dragData: RowDragData = useMemo((): RowDragData => {
    return {
      type: 'track' as const,
      trackId,
      track,
      panelId,
      playlistId,
      position,
      selectedTracks,
      trackPayload: externalTrackPayload ?? buildTrackPayload(track, providerId),
      selectedTrackPayloads: externalSelectedTrackPayloads
        ?? selectedTracks?.map((selectedTrack) => buildTrackPayload(selectedTrack, providerId)),
    };
  }, [selectedTracks, panelId, position, trackId, track, playlistId, providerId, externalTrackPayload, externalSelectedTrackPayloads]);

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: compositeId,
    disabled,
    data: dragData,
  });

  const { role: _attrRole, ...restAttributes } = attributes;

  return {
    compositeId,
    trackId,
    position,
    isDragging,
    setNodeRef,
    attributes: restAttributes,
    listeners,
  };
}
