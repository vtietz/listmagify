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
} from "./db";

// Playlist capture
export {
  captureSnapshot,
  captureAndUpdateEdges,
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
