import { queryAll, queryOne } from './db';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { DateRange, ProviderScopedRange } from './aggregations';

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
      AND event != 'login_failure'
    GROUP BY date(ts)
    ORDER BY date(ts)`,
    [range.from, range.to]
  );
}

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

export function getActionDistribution(range: DateRange): { event: string; count: number }[] {
  return queryAll<{ event: string; count: number }>(
    `SELECT 
      event,
      SUM(COALESCE(count, 1)) as count
    FROM events
    WHERE 
      date(ts) BETWEEN ? AND ?
      AND event IN ('track_add', 'track_remove', 'track_reorder')
    GROUP BY event
    ORDER BY count DESC`,
    [range.from, range.to]
  );
}

export interface TopUser {
  userHash: string;
  userId: string | null;
  eventCount: number;
  tracksAdded: number;
  tracksRemoved: number;
  byokLogins: number;
  regularLogins: number;
  lastActive: string;
  firstLoginAt: string | null;
  provider: MusicProviderId | null;
}

export type UserSortField = 'eventCount' | 'tracksAdded' | 'tracksRemoved' | 'byokLogins' | 'regularLogins' | 'lastActive' | 'firstLoginAt';
export type SortDirection = 'asc' | 'desc';

export function getTopUsers(
  range: ProviderScopedRange,
  limit: number = 10,
  offset: number = 0,
  sortBy: UserSortField = 'eventCount',
  sortDirection: SortDirection = 'desc'
): TopUser[] {
  const sortFieldMap: Record<UserSortField, string> = {
    eventCount: 'eventCount',
    tracksAdded: 'tracksAdded',
    tracksRemoved: 'tracksRemoved',
    byokLogins: 'byokLogins',
    regularLogins: 'regularLogins',
    lastActive: 'lastActive',
    firstLoginAt: 'firstLoginAt',
  };

  const sortColumn = sortFieldMap[sortBy] || 'eventCount';
  const sortDir = sortDirection === 'asc' ? 'ASC' : 'DESC';
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
      SUM(CASE WHEN e.event = 'login_success' AND e.is_byok = 1 THEN 1 ELSE 0 END) as byokLogins,
      SUM(CASE WHEN e.event = 'login_success' AND (e.is_byok IS NULL OR e.is_byok = 0) THEN 1 ELSE 0 END) as regularLogins,
      MAX(e.ts) as lastActive,
      r.registered_at as firstLoginAt,
      MAX(COALESCE(e.provider, r.provider)) as provider
    FROM events e
    LEFT JOIN user_registrations r ON e.user_id = r.user_id
    WHERE 
      date(e.ts) BETWEEN ? AND ?
      AND (? IS NULL OR e.provider = ?)
      AND e.user_hash IS NOT NULL
      AND e.event != 'login_failure'
    GROUP BY e.user_hash, e.user_id, r.registered_at
    ORDER BY ${orderClause}
    LIMIT ? OFFSET ?`,
    [range.from, range.to, range.provider ?? null, range.provider ?? null, limit, offset]
  );
}

export function getTotalUserCount(range: ProviderScopedRange): number {
  const result = queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT user_hash) as count
    FROM events
    WHERE 
      date(ts) BETWEEN ? AND ?
      AND (? IS NULL OR provider = ?)
      AND user_hash IS NOT NULL
      AND event != 'login_failure'`,
    [range.from, range.to, range.provider ?? null, range.provider ?? null]
  );
  return result?.count ?? 0;
}

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

export interface DatabaseStats {
  sizeBytes: number;
  sizeMB: number;
}

export function getDatabaseStats(): DatabaseStats | null {
  const { getDatabaseSize } = require('./db');
  return getDatabaseSize();
}
