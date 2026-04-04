import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { badRequest, fromError } from '@/app/api/_shared/http';
import { getSyncPair } from '@/lib/sync/syncStore';
import { initiateSyncRun, executeSyncRun } from '@/lib/sync/executor';
import type { ExecuteSyncOptions } from '@/lib/sync/executor';
import { getAllSessionUserIds } from '@/lib/auth/sessionUserIds';
import { normalizeConvertThreshold, deriveManualThreshold } from '@/lib/matching/config';
import type { SyncMatchThresholds } from '@/lib/sync/executor';

function parseMatchThresholds(body: Record<string, unknown>): SyncMatchThresholds | undefined {
  const raw = body.matchThresholds;
  if (!raw || typeof raw !== 'object') return undefined;

  const obj = raw as Record<string, unknown>;
  if (typeof obj.convert !== 'number') return undefined;

  const convert = normalizeConvertThreshold(obj.convert);
  const manual = deriveManualThreshold(convert);
  return { convert, manual };
}

/**
 * POST /api/sync/execute
 *
 * Creates a SyncRun, kicks off execution asynchronously, and returns
 * the runId immediately (202 Accepted). The frontend picks up status
 * changes via the existing useSyncPairs polling.
 *
 * Body: { syncPairId, matchThresholds? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await assertAuthenticated();
    const body = await request.json();

    if (!body.syncPairId || typeof body.syncPairId !== 'string') {
      return badRequest('syncPairId is required');
    }

    const userIds = getAllSessionUserIds(session);
    const pair = getSyncPair(body.syncPairId, userIds);
    if (!pair) {
      return badRequest('Sync pair not found');
    }

    const matchThresholds = parseMatchThresholds(body);
    const options: ExecuteSyncOptions = {
      pair,
      triggeredBy: 'manual',
      matchThresholds,
    };

    // Create run synchronously, then fire-and-forget the execution
    const runId = initiateSyncRun(options);
    executeSyncRun(runId, options).catch(() => {
      // Errors are recorded on the run record; nothing to do here
    });

    return NextResponse.json({ runId }, { status: 202 });
  } catch (error) {
    console.error('[api/sync/execute] Error:', error);
    return fromError(error);
  }
}
