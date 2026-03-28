import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, created, badRequest, fromError } from '@/app/api/_shared/http';
import { parseMusicProviderId } from '@/lib/music-provider';
import { createSyncPair, listSyncPairs, getLatestSyncRun } from '@/lib/sync/syncStore';
import type { SyncDirection } from '@/lib/sync/types';

const VALID_DIRECTIONS = new Set<SyncDirection>(['a-to-b', 'b-to-a', 'bidirectional']);

function isValidDirection(value: unknown): value is SyncDirection {
  return typeof value === 'string' && VALID_DIRECTIONS.has(value as SyncDirection);
}

/**
 * GET /api/sync/pairs
 *
 * List all saved sync pairs for the authenticated user.
 */
export async function GET() {
  try {
    const session = await assertAuthenticated();
    const pairs = listSyncPairs(session.user.id);
    const pairsWithLatestRun = pairs.map((pair) => ({
      ...pair,
      latestRun: getLatestSyncRun(pair.id),
    }));
    return ok({ pairs: pairsWithLatestRun });
  } catch (error) {
    console.error('[api/sync/pairs] GET Error:', error);
    return fromError(error);
  }
}

/**
 * POST /api/sync/pairs
 *
 * Create a new sync pair.
 *
 * Request body:
 *   { sourceProvider, sourcePlaylistId, targetProvider, targetPlaylistId, direction }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await assertAuthenticated();

    const body = await request.json();

    if (!body.sourceProvider || !body.sourcePlaylistId || !body.targetProvider || !body.targetPlaylistId || !body.direction) {
      return badRequest('Missing required fields: sourceProvider, sourcePlaylistId, targetProvider, targetPlaylistId, direction');
    }

    if (!isValidDirection(body.direction)) {
      return badRequest(`Invalid direction: ${body.direction}. Must be one of: a-to-b, b-to-a, bidirectional`);
    }

    if (body.sourceProvider === body.targetProvider && body.sourcePlaylistId === body.targetPlaylistId) {
      return badRequest('Cannot sync a playlist with itself');
    }

    const pair = createSyncPair({
      sourceProvider: parseMusicProviderId(body.sourceProvider),
      sourcePlaylistId: String(body.sourcePlaylistId),
      sourcePlaylistName: String(body.sourcePlaylistName ?? ''),
      targetProvider: parseMusicProviderId(body.targetProvider),
      targetPlaylistId: String(body.targetPlaylistId),
      targetPlaylistName: String(body.targetPlaylistName ?? ''),
      direction: body.direction as SyncDirection,
      createdBy: session.user.id,
    });

    return created({ pair });
  } catch (error) {
    console.error('[api/sync/pairs] POST Error:', error);
    return fromError(error);
  }
}
