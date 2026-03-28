/**
 * Shared types for playlist mutation hooks.
 */

import type { Track } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

// Re-export InfiniteData from sortUtils for convenience
export type { InfiniteData } from '@/lib/dnd/sortUtils';

export interface AddTracksParams {
  providerId?: MusicProviderId;
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
  providerId?: MusicProviderId;
  playlistId: string;
  tracks: TrackToRemove[];
  snapshotId?: string;
}

export interface ReorderTracksParams {
  providerId?: MusicProviderId;
  playlistId: string;
  fromIndex: number;
  toIndex: number;
  rangeLength?: number;
  snapshotId?: string;
}

export interface ReorderAllTracksParams {
  providerId?: MusicProviderId;
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
  providerId?: MusicProviderId;
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
  providerId?: MusicProviderId;
  playlistId: string;
  name?: string;
  description?: string;
  isPublic?: boolean;
}

export interface DeletePlaylistParams {
  providerId?: MusicProviderId;
  playlistId: string;
}

// Type alias for infinite query data structure
export type InfinitePlaylistData = import('@/lib/dnd/sortUtils').InfiniteData<PlaylistTracksData>;
