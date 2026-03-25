import { getDb, queryAll, queryOne } from './db';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { ProviderScopedRange } from './aggregations';

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
    spotifySuccesses: number;
    tidalSuccesses: number;
  }>;
  providerBreakdown: Array<{
    provider: MusicProviderId;
    successes: number;
    failures: number;
    byokSuccesses: number;
  }>;
  recentFailures: Array<{
    ts: string;
    errorCode: string | null;
    provider: MusicProviderId | null;
  }>;
}

export function getAuthStats(range: ProviderScopedRange): AuthStats {
  const db = getDb();
  if (!db) {
    return {
      loginSuccesses: 0,
      loginFailures: 0,
      byokLogins: 0,
      regularLogins: 0,
      successRate: 0,
      dailyStats: [],
      providerBreakdown: [],
      recentFailures: [],
    };
  }

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
      AND (? IS NULL OR provider = ?)
      AND event IN ('login_success', 'login_failure')`,
    [range.from, range.to, range.provider ?? null, range.provider ?? null]
  );

  const successes = overallResult?.successes ?? 0;
  const failures = overallResult?.failures ?? 0;
  const byokLogins = overallResult?.byokSuccesses ?? 0;
  const regularLogins = successes - byokLogins;
  const total = successes + failures;
  const successRate = total > 0 ? successes / total : 0;

  const dailyStats = queryAll<{
    date: string;
    successes: number;
    failures: number;
    byokSuccesses: number;
    spotifySuccesses: number;
    tidalSuccesses: number;
  }>(
    `SELECT 
      date(ts) as date,
      SUM(CASE WHEN event = 'login_success' THEN 1 ELSE 0 END) as successes,
      SUM(CASE WHEN event = 'login_failure' THEN 1 ELSE 0 END) as failures,
      SUM(CASE WHEN event = 'login_success' AND is_byok = 1 THEN 1 ELSE 0 END) as byokSuccesses,
      SUM(CASE WHEN event = 'login_success' AND provider = 'spotify' THEN 1 ELSE 0 END) as spotifySuccesses,
      SUM(CASE WHEN event = 'login_success' AND provider = 'tidal' THEN 1 ELSE 0 END) as tidalSuccesses
    FROM events
    WHERE date(ts) BETWEEN ? AND ?
      AND (? IS NULL OR provider = ?)
      AND event IN ('login_success', 'login_failure')
    GROUP BY date(ts)
    ORDER BY date(ts)`,
    [range.from, range.to, range.provider ?? null, range.provider ?? null]
  );

  const providerBreakdown = queryAll<{
    provider: MusicProviderId;
    successes: number;
    failures: number;
    byokSuccesses: number;
  }>(
    `SELECT
      provider,
      SUM(CASE WHEN event = 'login_success' THEN 1 ELSE 0 END) as successes,
      SUM(CASE WHEN event = 'login_failure' THEN 1 ELSE 0 END) as failures,
      SUM(CASE WHEN event = 'login_success' AND is_byok = 1 THEN 1 ELSE 0 END) as byokSuccesses
    FROM events
    WHERE date(ts) BETWEEN ? AND ?
      AND event IN ('login_success', 'login_failure')
      AND provider IN ('spotify', 'tidal')
      AND (? IS NULL OR provider = ?)
    GROUP BY provider
    ORDER BY provider`,
    [range.from, range.to, range.provider ?? null, range.provider ?? null]
  );

  const recentFailures = queryAll<{
    ts: string;
    errorCode: string | null;
    provider: MusicProviderId | null;
  }>(
    `SELECT 
      ts,
      error_code as errorCode,
      provider
    FROM events
    WHERE date(ts) BETWEEN ? AND ?
      AND (? IS NULL OR provider = ?)
      AND event = 'login_failure'
    ORDER BY ts DESC
    LIMIT 20`,
    [range.from, range.to, range.provider ?? null, range.provider ?? null]
  );

  return {
    loginSuccesses: successes,
    loginFailures: failures,
    byokLogins,
    regularLogins,
    successRate,
    dailyStats,
    providerBreakdown,
    recentFailures,
  };
}
