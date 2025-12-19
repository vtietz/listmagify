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
