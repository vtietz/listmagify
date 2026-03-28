import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, badRequest, fromError } from '@/app/api/_shared/http';
import { parseMusicProviderId } from '@/lib/music-provider';
import { executeSync, executeSyncFromPair } from '@/lib/sync/runner';
import type { SyncDirection } from '@/lib/sync/types';

const VALID_DIRECTIONS = new Set<SyncDirection>(['a-to-b', 'b-to-a', 'bidirectional']);

function isValidDirection(value: unknown): value is SyncDirection {
  return typeof value === 'string' && VALID_DIRECTIONS.has(value as SyncDirection);
}

/**
 * POST /api/sync/execute
 *
 * Preview and apply a sync plan. When using a saved pair, a SyncRun
 * record is created to track the operation.
 *
 * Accepts either an inline config:
 *   { sourceProvider, sourcePlaylistId, targetProvider, targetPlaylistId, direction }
 *
 * Or a saved pair reference:
 *   { syncPairId }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await assertAuthenticated();

    const body = await request.json();

    // Pair-based execute
    if (body.syncPairId) {
      if (typeof body.syncPairId !== 'string') {
        return badRequest('syncPairId must be a string');
      }
      const outcome = await executeSyncFromPair(body.syncPairId, session.user.id);
      return ok(outcome);
    }

    // Inline config execute
    if (!body.sourceProvider || !body.sourcePlaylistId || !body.targetProvider || !body.targetPlaylistId || !body.direction) {
      return badRequest('Missing required fields: sourceProvider, sourcePlaylistId, targetProvider, targetPlaylistId, direction');
    }

    if (!isValidDirection(body.direction)) {
      return badRequest(`Invalid direction: ${body.direction}. Must be one of: a-to-b, b-to-a, bidirectional`);
    }

    const config = {
      sourceProvider: parseMusicProviderId(body.sourceProvider),
      sourcePlaylistId: String(body.sourcePlaylistId),
      targetProvider: parseMusicProviderId(body.targetProvider),
      targetPlaylistId: String(body.targetPlaylistId),
      direction: body.direction as SyncDirection,
    };

    const outcome = await executeSync(config);
    return ok(outcome);
  } catch (error) {
    console.error('[api/sync/execute] Error:', error);
    return fromError(error);
  }
}
