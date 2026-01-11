/**
 * Metrics module - privacy-preserving usage analytics.
 * 
 * @example
 * ```ts
 * import { insertEvent, logTrackOperation } from '@/lib/metrics';
 * 
 * // Log a track add operation
 * logTrackOperation('track_add', userId, playlistId, trackCount);
 * ```
 */

export { getMetricsConfig, isUserAllowedForStats } from './env';
export { getDb, closeDb, runRetentionCleanup } from './db';
export {
  insertEvent,
  hashUserId,
  withApiTiming,
  logTrackOperation,
  logFetchOperation,
  logAuthEvent,
  logPageView,
  startSession,
  endSession,
  type MetricEvent,
  type MetricSource,
  type EntityType,
  type EventParams,
} from './logger';
export {
  getEventsByDay,
  getDailySummaries,
  getOverviewKPIs,
  getTopPlaylists,
  getSessionsByDay,
  getActionDistribution,
  getDailyUsers,
  getDailyActions,
  getTopUsers,
  getTotalUserCount,
  getRegisteredUsersPerDay,
  updateDailyAggregates,
  type DateRange,
  type EventCount,
  type DailyEventSummary,
  type OverviewKPIs,
  type TopPlaylist,
  type SessionSummary,
  type DailyUsers,
  type DailyActions,
  type TopUser,
  type UserSortField,
  type SortDirection,
  type RegisteredUsersPerDay,
} from './aggregations';
export {
  saveFeedback,
  getFeedbackStats,
  type FeedbackParams,
  type FeedbackEntry,
  type FeedbackStats,
} from './feedback';
