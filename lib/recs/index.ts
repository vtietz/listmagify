/**
 * Recommendation System Index
 * 
 * Re-exports all public APIs for the recommendation system.
 */

// Configuration
export { recsEnv, scoringWeights, recsParams } from "./env";

// Database
export { 
  getRecsDb, 
  closeRecsDb, 
  isRecsAvailable,
  getRecsMigrationStatus,
  withTransaction,
  unixNow,
  type TrackRow,
  type PlaylistTrackRow,
} from "./db";

// Playlist capture
export {
  captureSnapshot,
  captureAndUpdateEdges,
  getLatestSnapshotTimestamp,
  isSnapshotStale,
  getLatestPlaylistTrackIds,
  prunePlaylistSnapshots,
  type PlaylistSnapshotInput,
} from "./capture";

// Edge management
export {
  updateAdjacencyEdgesFromPlaylist,
  updateCooccurrenceEdgesFromPlaylist,
  updateEdgesForAdd,
  updateEdgesForRemove,
  updateEdgesForReorder,
  updateEdgesForAddRemoveReorder,
  getAdjacencyEdgesFrom,
  getCooccurrenceNeighbors,
} from "./edges";

// Catalog
export {
  upsertArtistTopTracks,
  upsertAlbumTracks,
  upsertTrackPopularity,
  upsertRelatedArtists,
  deriveCatalogEdges,
  ensureArtistTopTracks,
  ensureAlbumTracks,
  ensureTrackPopularities,
  ensureRelatedArtists,
  getCatalogEdges,
  getTrackPopularity,
  getTrackPopularities,
  getAlbumAdjacency,
} from "./catalog";

// Scoring and recommendations
export {
  getSeedRecommendations,
  getPlaylistAppendixRecommendations,
  filterExcluded,
  dismissRecommendation,
  clearDismissals,
  type RecommendationCandidate,
  type Recommendation,
  type RecommendationContext,
} from "./score";
