import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats, getAllSessionUserIds } from '@/lib/metrics/env';
import { hashUserId } from '@/lib/metrics/logger';
import { getAllSyncPairsWithLatestRun, listSyncRunsForPair } from '@/lib/sync/syncStore';
import { getRecentImportJobsAdmin } from '@/lib/import/importStore';
import { getAllTokenStatuses } from '@/lib/auth/tokenStore';

/**
 * Parse a prefixed user ID ("provider:accountId") into its parts.
 * Falls back to unknown provider if no prefix found.
 */
function parseCreatedBy(createdBy: string): { provider: string; accountId: string } {
  const colonIdx = createdBy.indexOf(':');
  if (colonIdx > 0) {
    return { provider: createdBy.slice(0, colonIdx), accountId: createdBy.slice(colonIdx + 1) };
  }
  return { provider: 'unknown', accountId: createdBy };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isUserAllowedForStats(getAllSessionUserIds(session))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const pairsWithLatest = getAllSyncPairsWithLatestRun();
    const activePairs = pairsWithLatest.filter((p) => p.syncInterval !== 'off');
    const failingPairs = pairsWithLatest.filter((p) => p.consecutiveFailures > 0);
    const disabledPairs = pairsWithLatest.filter((p) => p.syncInterval === 'off');

    // Enrich each pair with recent run history (up to 10) and anonymize
    const pairs = pairsWithLatest.map((pair) => {
      const { accountId, provider: creatorProvider } = parseCreatedBy(pair.createdBy);
      return {
        id: pair.id,
        sourceProvider: pair.sourceProvider,
        targetProvider: pair.targetProvider,
        direction: pair.direction,
        syncInterval: pair.syncInterval,
        nextRunAt: pair.nextRunAt,
        consecutiveFailures: pair.consecutiveFailures,
        createdAt: pair.createdAt,
        // Anonymized user info for admin display
        createdByHash: hashUserId(pair.createdBy),
        createdByRaw: pair.createdBy, // For UserDetailDialog lookup
        creatorProvider,
        creatorAccountId: accountId,
        latestRun: pair.latestRun,
        recentRuns: listSyncRunsForPair(pair.id, 10),
      };
    });

    const importJobs = getRecentImportJobsAdmin(20).map((job) => {
      const { accountId, provider: creatorProvider } = parseCreatedBy(job.createdBy);
      return {
        ...job,
        createdByHash: hashUserId(job.createdBy),
        createdByRaw: job.createdBy,
        creatorProvider,
        creatorAccountId: accountId,
      };
    });

    const tokenStatuses = getAllTokenStatuses();

    return NextResponse.json({
      success: true,
      data: {
        syncScheduler: {
          totalPairs: pairs.length,
          activePairs: activePairs.length,
          failingPairs: failingPairs.length,
          disabledPairs: disabledPairs.length,
          pairs,
        },
        importJobs,
        tokenStatus: { tokens: tokenStatuses },
        workerStatus: {
          syncSchedulerEnabled: process.env.SYNC_SCHEDULER_ENABLED === 'true',
          tokenKeepaliveEnabled: process.env.TOKEN_KEEPALIVE_ENABLED === 'true',
        },
      },
    });
  } catch (error) {
    console.error('[stats/background-tasks] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch background tasks' }, { status: 500 });
  }
}
