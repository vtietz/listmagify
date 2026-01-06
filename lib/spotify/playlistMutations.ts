/**
 * React Query mutation hooks for playlist operations.
 * 
 * @deprecated Import directly from '@/lib/spotify/mutations' instead.
 * This file re-exports from the new modular location for backward compatibility.
 */

// Re-export all hooks and utilities from the new modular location
export {
  // Mutation hooks
  useAddTracks,
  useRemoveTracks,
  useReorderTracks,
  useReorderAllTracks,
  useCreatePlaylist,
  useUpdatePlaylist,
  
  // Utility functions
  checkPlaylistEditable,
  
  // Types
  type AddTracksParams,
  type RemoveTracksParams,
  type ReorderTracksParams,
  type ReorderAllTracksParams,
  type TrackToRemove,
  type MutationResponse,
  type PlaylistTracksData,
  type InfinitePlaylistData,
  type CreatePlaylistParams,
  type CreatePlaylistResponse,
  type UpdatePlaylistParams,
} from './mutations';

