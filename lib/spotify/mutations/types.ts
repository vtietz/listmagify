/**
 * Shared types for playlist mutation hooks.
 */

import type { Track } from '@/lib/spotify/types';

// Re-export InfiniteData from sortUtils for convenience
export type { InfiniteData } from '@/lib/dnd/sortUtils';

export interface AddTracksParams {
  playlistId: string;
  trackUris: string[];
  position?: number;
  snapshotId?: string;
}

export interface TrackToRemove {
  uri: string;
  positions?: number[];  // Specific positions to remove (for duplicate tracks)
}

export interface RemoveTracksParams {
  playlistId: string;
  tracks: TrackToRemove[];
  snapshotId?: string;
}

export interface ReorderTracksParams {
  playlistId: string;
  fromIndex: number;
  toIndex: number;
  rangeLength?: number;
  snapshotId?: string;
}

export interface ReorderAllTracksParams {
  playlistId: string;
  trackUris: string[];
}

export interface MutationResponse {
  snapshotId: string;
}

export interface PlaylistTracksData {
  tracks: Track[];
  snapshotId: string;
  total: number;
  nextCursor: string | null;
}

export interface CreatePlaylistParams {
  name: string;
  description?: string;
  isPublic?: boolean;
}

export interface CreatePlaylistResponse {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  ownerName: string | null;
  image: { url: string; width?: number | null; height?: number | null } | null;
  tracksTotal: number;
}

export interface UpdatePlaylistParams {
  playlistId: string;
  name?: string;
  description?: string;
  isPublic?: boolean;
}

// Type alias for infinite query data structure
export type InfinitePlaylistData = import('@/lib/dnd/sortUtils').InfiniteData<PlaylistTracksData>;
