import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats, getAllSessionUserIds } from '@/lib/metrics/env';
import { getAllSyncPairsWithLatestRun, listSyncRunsForPair } from '@/lib/sync/syncStore';
import { getRecentImportJobsAdmin } from '@/lib/import/importStore';
import { getAllTokenStatuses } from '@/lib/auth/tokenStore';

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

    // Enrich each pair with recent run history (up to 10)
    const pairs = pairsWithLatest.map((pair) => ({
      ...pair,
      recentRuns: listSyncRunsForPair(pair.id, 10),
    }));

    const importJobs = getRecentImportJobsAdmin(20);
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
