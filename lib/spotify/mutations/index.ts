/**
 * Barrel export for playlist mutation hooks.
 * 
 * This module re-exports all playlist mutation hooks and utilities
 * for convenient importing from a single location.
 */

// Mutation hooks
export { useAddTracks } from './useAddTracks';
export { useRemoveTracks } from './useRemoveTracks';
export { useReorderTracks } from './useReorderTracks';
export { useReorderAllTracks } from './useReorderAllTracks';
export { useCreatePlaylist } from './useCreatePlaylist';
export { useUpdatePlaylist } from './useUpdatePlaylist';

// Utility functions
export { checkPlaylistEditable } from './checkPlaylistEditable';

// Re-export types for convenience
export type {
  AddTracksParams,
  RemoveTracksParams,
  ReorderTracksParams,
  ReorderAllTracksParams,
  TrackToRemove,
  MutationResponse,
  PlaylistTracksData,
  InfinitePlaylistData,
  CreatePlaylistParams,
  CreatePlaylistResponse,
  UpdatePlaylistParams,
} from './types';

// Re-export helpers for advanced use cases
export {
  cancelPlaylistQueries,
  snapshotPlaylistCaches,
  rollbackPlaylistCaches,
  updateInfiniteSnapshotId,
  updateLegacySnapshotId,
  updateBothSnapshotIds,
} from './helpers';
