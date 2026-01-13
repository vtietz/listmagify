/**
 * Shared types for stats dashboard components
 */

// Time range presets
export type TimeRange = 'today' | '7d' | '30d' | '90d' | 'ytd' | 'all' | 'custom';
export type UserSortField = 'eventCount' | 'tracksAdded' | 'tracksRemoved' | 'lastActive' | 'firstLoginAt';
export type SortDirection = 'asc' | 'desc';

export interface DateRange {
  from: string;
  to: string;
}

export interface OverviewKPIs {
  activeUsers: number;
  totalEvents: number;
  tracksAdded: number;
  tracksRemoved: number;
  avgApiDurationMs: number;
  errorRate: number;
  totalSessions: number;
  avgSessionDurationMs: number;
}

export interface RecsStats {
  enabled: boolean;
  stats: {
    tracks: number;
    playlistSnapshots: number;
    playlistsIndexed: number;
    seqEdges: number;
    cooccurEdges: number;
    catalogEdges: number;
    artistTopTracks: number;
    albumTracks: number;
    relatedArtists: number;
    trackPopularities: number;
    dismissedRecommendations: number;
    dbSizeBytes: number;
    dbSizeMB: string;
    recentSnapshotsLast7Days: number;
    totalEdges: number;
  } | null;
  topTracks?: TopTrack[];
  totalTracks?: number;
  message?: string;
}

export interface TopTrack {
  trackId: string;
  name: string;
  artist: string | null;
  edgeCount: number;
}

export interface FeedbackEntry {
  id: number;
  ts: string;
  userHash: string | null;
  npsScore: number | null;
  comment: string | null;
  name?: string | null;
  email?: string | null;
}

export interface FeedbackStats {
  totalResponses: number;
  averageScore: number;
  nps: number;
  promoters: number;
  passives: number;
  detractors: number;
  recentFeedback: FeedbackEntry[];
}

export interface TopUser {
  userHash: string;
  userId: string | null;
  eventCount: number;
  tracksAdded: number;
  tracksRemoved: number;
  lastActive: string;
  firstLoginAt: string | null;
}

export interface TopUsersResponse {
  success: boolean;
  data: TopUser[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface DailySummary {
  date: string;
  total: number;
  trackAdds: number;
  trackRemoves: number;
  trackReorders: number;
  apiCalls: number;
  errors: number;
}

export interface ActionDistribution {
  event: string;
  count: number;
}

export interface TopPlaylist {
  playlistId: string;
  interactions: number;
}

export interface DailyUsers {
  date: string;
  users: number;
}

export interface DailyActions {
  date: string;
  actions: number;
  adds: number;
  removes: number;
  reorders: number;
}

export interface RegisteredUsersPerDay {
  date: string;
  newUsers: number;
  cumulativeUsers: number;
}

export interface AuthStats {
  loginSuccesses: number;
  loginFailures: number;
  successRate: number;
  dailyStats: Array<{
    date: string;
    successes: number;
    failures: number;
  }>;
  recentFailures: Array<{
    ts: string;
    errorCode: string | null;
  }>;
}

export interface ErrorReport {
  id: number;
  report_id: string;
  ts: string;
  user_id: string | null;
  user_name: string | null;
  user_hash: string | null;
  error_category: string;
  error_severity: string;
  error_message: string;
  error_details: string | null;
  error_status_code: number | null;
  error_request_path: string | null;
  user_description: string | null;
  environment_json: string | null;
  app_version: string | null;
  resolved: number;
}

export interface ErrorReportsResponse {
  success: boolean;
  data: ErrorReport[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AccessRequest {
  id: number;
  ts: string;
  name: string;
  email: string;
  motivation: string | null;
  status: string;
  notes: string | null;
}

export interface AccessRequestsResponse {
  success: boolean;
  data: AccessRequest[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface EventsData {
  dailySummaries: DailySummary[];
  actionDistribution: ActionDistribution[];
  topPlaylists: TopPlaylist[];
  dailyUsers: DailyUsers[];
  dailyActions: DailyActions[];
}
