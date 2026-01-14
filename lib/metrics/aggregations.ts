/**
 * Aggregation queries for the stats dashboard.
 * All queries return data suitable for charts and KPIs.
 */

import { getDb, queryAll, queryOne, execute } from './db';

export interface DateRange {
  from: string; // ISO date string (YYYY-MM-DD)
  to: string;   // ISO date string (YYYY-MM-DD)
}

export interface EventCount {
  date: string;
  event: string;
  count: number;
}

export interface DailyEventSummary {
  date: string;
  total: number;
  trackAdds: number;
  trackRemoves: number;
  trackReorders: number;
  apiCalls: number;
  errors: number;
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

export interface TopPlaylist {
  playlistId: string;
  interactions: number;
}

export interface SessionSummary {
  date: string;
  activeUsers: number;
  sessions: number;
  avgDurationMs: number;
}

/**
 * Get event counts grouped by day and event type.
 */
export function getEventsByDay(range: DateRange): EventCount[] {
  return queryAll<EventCount>(
    `SELECT 
      date(ts) as date,
      event,
      COUNT(*) as count
    FROM events
    WHERE date(ts) BETWEEN ? AND ?
    GROUP BY date(ts), event
    ORDER BY date(ts), event`,
    [range.from, range.to]
  );
}

/**
 * Get daily summary with event breakdown.
 */
export function getDailySummaries(range: DateRange): DailyEventSummary[] {
  return queryAll<DailyEventSummary>(
    `SELECT 
      date(ts) as date,
      COUNT(*) as total,
      SUM(CASE WHEN event = 'track_add' THEN 1 ELSE 0 END) as trackAdds,
      SUM(CASE WHEN event = 'track_remove' THEN 1 ELSE 0 END) as trackRemoves,
      SUM(CASE WHEN event = 'track_reorder' THEN 1 ELSE 0 END) as trackReorders,
      SUM(CASE WHEN event = 'api_call' THEN 1 ELSE 0 END) as apiCalls,
      SUM(CASE WHEN event = 'api_error' THEN 1 ELSE 0 END) as errors
    FROM events
    WHERE date(ts) BETWEEN ? AND ?
    GROUP BY date(ts)
    ORDER BY date(ts)`,
    [range.from, range.to]
  );
}

/**
 * Get overview KPIs for a date range.
 */
export function getOverviewKPIs(range: DateRange): OverviewKPIs {
  const db = getDb();
  if (!db) {
    return {
      activeUsers: 0,
      totalEvents: 0,
      tracksAdded: 0,
      tracksRemoved: 0,
      avgApiDurationMs: 0,
      errorRate: 0,
      totalSessions: 0,
      avgSessionDurationMs: 0,
    };
  }

  // Events stats
  const eventsResult = queryOne<Record<string, number | null>>(
    `SELECT 
      COUNT(DISTINCT user_hash) as activeUsers,
      COUNT(*) as totalEvents,
      SUM(CASE WHEN event = 'track_add' THEN COALESCE(count, 1) ELSE 0 END) as tracksAdded,
      SUM(CASE WHEN event = 'track_remove' THEN COALESCE(count, 1) ELSE 0 END) as tracksRemoved,
      AVG(CASE WHEN event IN ('api_call', 'api_error') THEN duration_ms END) as avgApiDurationMs,
      SUM(CASE WHEN event = 'api_error' THEN 1 ELSE 0 END) * 1.0 / 
        NULLIF(SUM(CASE WHEN event IN ('api_call', 'api_error') THEN 1 ELSE 0 END), 0) as errorRate
    FROM events
    WHERE date(ts) BETWEEN ? AND ?`,
    [range.from, range.to]
  ) ?? {};

  // Sessions stats
  const sessionsResult = queryOne<Record<string, number | null>>(
    `SELECT 
      COUNT(*) as totalSessions,
      AVG(
        CASE WHEN ended_at IS NOT NULL 
        THEN (julianday(ended_at) - julianday(started_at)) * 24 * 60 * 60 * 1000
        END
      ) as avgSessionDurationMs
    FROM sessions
    WHERE date(started_at) BETWEEN ? AND ?`,
    [range.from, range.to]
  ) ?? {};

  return {
    activeUsers: eventsResult.activeUsers ?? 0,
    totalEvents: eventsResult.totalEvents ?? 0,
    tracksAdded: eventsResult.tracksAdded ?? 0,
    tracksRemoved: eventsResult.tracksRemoved ?? 0,
    avgApiDurationMs: Math.round(eventsResult.avgApiDurationMs ?? 0),
    errorRate: eventsResult.errorRate ?? 0,
    totalSessions: sessionsResult.totalSessions ?? 0,
    avgSessionDurationMs: Math.round(sessionsResult.avgSessionDurationMs ?? 0),
  };
}

/**
 * Get top playlists by interaction count.
 */
export function getTopPlaylists(range: DateRange, limit: number = 10): TopPlaylist[] {
  return queryAll<TopPlaylist>(
    `SELECT 
      entity_id as playlistId,
      COUNT(*) as interactions
    FROM events
    WHERE 
      date(ts) BETWEEN ? AND ?
      AND entity_type = 'playlist'
      AND entity_id IS NOT NULL
    GROUP BY entity_id
    ORDER BY interactions DESC
    LIMIT ?`,
    [range.from, range.to, limit]
  );
}

/**
 * Get session summary by day.
 */
export function getSessionsByDay(range: DateRange): SessionSummary[] {
  const rows = queryAll<{
    date: string;
    activeUsers: number;
    sessions: number;
    avgDurationMs: number | null;
  }>(
    `SELECT 
      date(started_at) as date,
      COUNT(DISTINCT user_hash) as activeUsers,
      COUNT(*) as sessions,
      AVG(
        CASE WHEN ended_at IS NOT NULL 
        THEN (julianday(ended_at) - julianday(started_at)) * 24 * 60 * 60 * 1000
        END
      ) as avgDurationMs
    FROM sessions
    WHERE date(started_at) BETWEEN ? AND ?
    GROUP BY date(started_at)
    ORDER BY date(started_at)`,
    [range.from, range.to]
  );

  return rows.map(row => ({
    date: row.date,
    activeUsers: row.activeUsers,
    sessions: row.sessions,
    avgDurationMs: Math.round(row.avgDurationMs ?? 0),
  }));
}

/**
 * Get unique users per day from events.
 */
export interface DailyUsers {
  date: string;
  users: number;
}

export function getDailyUsers(range: DateRange): DailyUsers[] {
  return queryAll<DailyUsers>(
    `SELECT 
      date(ts) as date,
      COUNT(DISTINCT user_hash) as users
    FROM events
    WHERE date(ts) BETWEEN ? AND ?
    GROUP BY date(ts)
    ORDER BY date(ts)`,
    [range.from, range.to]
  );
}

/**
 * Get daily actions (track operations only).
 */
export interface DailyActions {
  date: string;
  actions: number;
  adds: number;
  removes: number;
  reorders: number;
}

export function getDailyActions(range: DateRange): DailyActions[] {
  return queryAll<DailyActions>(
    `SELECT 
      date(ts) as date,
      COUNT(*) as actions,
      SUM(CASE WHEN event = 'track_add' THEN 1 ELSE 0 END) as adds,
      SUM(CASE WHEN event = 'track_remove' THEN 1 ELSE 0 END) as removes,
      SUM(CASE WHEN event = 'track_reorder' THEN 1 ELSE 0 END) as reorders
    FROM events
    WHERE 
      date(ts) BETWEEN ? AND ?
      AND event IN ('track_add', 'track_remove', 'track_reorder')
    GROUP BY date(ts)
    ORDER BY date(ts)`,
    [range.from, range.to]
  );
}

/**
 * Get action distribution (add/remove/reorder).
 */
export function getActionDistribution(range: DateRange): { event: string; count: number }[] {
  return queryAll<{ event: string; count: number }>(
    `SELECT 
      event,
      COUNT(*) as count
    FROM events
    WHERE 
      date(ts) BETWEEN ? AND ?
      AND event IN ('track_add', 'track_remove', 'track_reorder')
    GROUP BY event
    ORDER BY count DESC`,
    [range.from, range.to]
  );
}

/**
 * Top user by event count.
 */
export interface TopUser {
  userHash: string;
  userId: string | null; // Actual Spotify user ID for profile fetching
  eventCount: number;
  tracksAdded: number;
  tracksRemoved: number;
  lastActive: string;
  firstLoginAt: string | null; // When user first logged in
}

export type UserSortField = 'eventCount' | 'tracksAdded' | 'tracksRemoved' | 'lastActive' | 'firstLoginAt';
export type SortDirection = 'asc' | 'desc';

/**
 * Get top users by event count (paginated and sortable).
 */
export function getTopUsers(
  range: DateRange, 
  limit: number = 10, 
  offset: number = 0,
  sortBy: UserSortField = 'eventCount',
  sortDirection: SortDirection = 'desc'
): TopUser[] {
  // Map sort fields to SQL columns
  const sortFieldMap: Record<UserSortField, string> = {
    eventCount: 'eventCount',
    tracksAdded: 'tracksAdded',
    tracksRemoved: 'tracksRemoved',
    lastActive: 'lastActive',
    firstLoginAt: 'firstLoginAt',
  };
  
  const sortColumn = sortFieldMap[sortBy] || 'eventCount';
  const sortDir = sortDirection === 'asc' ? 'ASC' : 'DESC';
  
  // For first login sort, nulls should go last
  const orderClause = sortBy === 'firstLoginAt'
    ? `${sortColumn} ${sortDir} NULLS LAST`
    : `${sortColumn} ${sortDir}`;
  
  return queryAll<TopUser>(
    `SELECT 
      e.user_hash as userHash,
      e.user_id as userId,
      COUNT(*) as eventCount,
      SUM(CASE WHEN e.event = 'track_add' THEN COALESCE(e.count, 1) ELSE 0 END) as tracksAdded,
      SUM(CASE WHEN e.event = 'track_remove' THEN COALESCE(e.count, 1) ELSE 0 END) as tracksRemoved,
      MAX(e.ts) as lastActive,
      r.registered_at as firstLoginAt
    FROM events e
    LEFT JOIN user_registrations r ON e.user_id = r.user_id
    WHERE 
      date(e.ts) BETWEEN ? AND ?
      AND e.user_hash IS NOT NULL
    GROUP BY e.user_hash, e.user_id, r.registered_at
    ORDER BY ${orderClause}
    LIMIT ? OFFSET ?`,
    [range.from, range.to, limit, offset]
  );
}

/**
 * Get total count of unique users for pagination.
 */
export function getTotalUserCount(range: DateRange): number {
  const result = queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT user_hash) as count
    FROM events
    WHERE 
      date(ts) BETWEEN ? AND ?
      AND user_hash IS NOT NULL`,
    [range.from, range.to]
  );
  return result?.count ?? 0;
}

/**
 * Get registered users over time (by day).
 */
export interface RegisteredUsersPerDay {
  date: string;
  newUsers: number;
  cumulativeUsers: number;
}

export function getRegisteredUsersPerDay(range: DateRange): RegisteredUsersPerDay[] {
  return queryAll<RegisteredUsersPerDay>(
    `SELECT 
      date(registered_at) as date,
      COUNT(*) as newUsers,
      (SELECT COUNT(*) FROM user_registrations WHERE date(registered_at) <= date(r.registered_at)) as cumulativeUsers
    FROM user_registrations r
    WHERE date(registered_at) BETWEEN ? AND ?
    GROUP BY date(registered_at)
    ORDER BY date ASC`,
    [range.from, range.to]
  );
}

/**
 * Authentication stats.
 */
export interface AuthStats {
  loginSuccesses: number;
  loginFailures: number;
  byokLogins: number;
  regularLogins: number;
  successRate: number;
  dailyStats: Array<{
    date: string;
    successes: number;
    failures: number;
    byokSuccesses: number;
  }>;
  recentFailures: Array<{
    ts: string;
    errorCode: string | null;
  }>;
}

/**
 * Get authentication statistics (login successes and failures).
 */
export function getAuthStats(range: DateRange): AuthStats {
  const db = getDb();
  if (!db) {
    return {
      loginSuccesses: 0,
      loginFailures: 0,
      byokLogins: 0,
      regularLogins: 0,
      successRate: 0,
      dailyStats: [],
      recentFailures: [],
    };
  }

  // Overall stats
  const overallResult = queryOne<{
    successes: number | null;
    failures: number | null;
    byokSuccesses: number | null;
  }>(
    `SELECT 
      SUM(CASE WHEN event = 'login_success' THEN 1 ELSE 0 END) as successes,
      SUM(CASE WHEN event = 'login_failure' THEN 1 ELSE 0 END) as failures,
      SUM(CASE WHEN event = 'login_success' AND is_byok = 1 THEN 1 ELSE 0 END) as byokSuccesses
    FROM events
    WHERE date(ts) BETWEEN ? AND ?
      AND event IN ('login_success', 'login_failure')`,
    [range.from, range.to]
  );

  const successes = overallResult?.successes ?? 0;
  const failures = overallResult?.failures ?? 0;
  const byokLogins = overallResult?.byokSuccesses ?? 0;
  const regularLogins = successes - byokLogins;
  const total = successes + failures;
  const successRate = total > 0 ? successes / total : 0;

  // Daily breakdown
  const dailyStats = queryAll<{
    date: string;
    successes: number;
    failures: number;
    byokSuccesses: number;
  }>(
    `SELECT 
      date(ts) as date,
      SUM(CASE WHEN event = 'login_success' THEN 1 ELSE 0 END) as successes,
      SUM(CASE WHEN event = 'login_failure' THEN 1 ELSE 0 END) as failures,
      SUM(CASE WHEN event = 'login_success' AND is_byok = 1 THEN 1 ELSE 0 END) as byokSuccesses
    FROM events
    WHERE date(ts) BETWEEN ? AND ?
      AND event IN ('login_success', 'login_failure')
    GROUP BY date(ts)
    ORDER BY date(ts)`,
    [range.from, range.to]
  );

  // Recent failures (last 20)
  const recentFailures = queryAll<{
    ts: string;
    errorCode: string | null;
  }>(
    `SELECT 
      ts,
      error_code as errorCode
    FROM events
    WHERE date(ts) BETWEEN ? AND ?
      AND event = 'login_failure'
    ORDER BY ts DESC
    LIMIT 20`,
    [range.from, range.to]
  );

  return {
    loginSuccesses: successes,
    loginFailures: failures,
    byokLogins,
    regularLogins,
    successRate,
    dailyStats,
    recentFailures,
  };
}

/**
 * Update daily aggregates (run periodically, e.g., via cron or on-demand).
 */
export function updateDailyAggregates(date: string): void {
  const db = getDb();
  if (!db) return;

  execute(`DELETE FROM aggregates_daily WHERE day = ?`, [date]);

  execute(
    `INSERT INTO aggregates_daily (day, event, total_count, unique_users, avg_duration_ms, errors)
    SELECT 
      date(ts) as day,
      event,
      COUNT(*) as total_count,
      COUNT(DISTINCT user_hash) as unique_users,
      AVG(duration_ms) as avg_duration_ms,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors
    FROM events
    WHERE date(ts) = ?
    GROUP BY date(ts), event`,
    [date]
  );
}
