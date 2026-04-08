import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, created, badRequest, conflict, fromError } from '@/app/api/_shared/http';
import { parseMusicProviderId } from '@/lib/music-provider';
import { createSyncPair, listSyncPairs, getLatestSyncRun } from '@/lib/sync/syncStore';
import { getAllSessionUserIds, getCreatorUserId, getProviderUserIds } from '@/lib/auth/sessionUserIds';
import { serverEnv } from '@/lib/env';
import type { SyncDirection, SyncInterval } from '@/lib/sync/types';

const VALID_DIRECTIONS = new Set<SyncDirection>(['a-to-b', 'b-to-a', 'bidirectional']);

function isValidDirection(value: unknown): value is SyncDirection {
  return typeof value === 'string' && VALID_DIRECTIONS.has(value as SyncDirection);
}

type CreateSyncPairBody = {
  sourceProvider: string;
  sourcePlaylistId: string;
  sourcePlaylistName: string;
  targetProvider: string;
  targetPlaylistId: string;
  targetPlaylistName: string;
  direction: SyncDirection;
  autoSync?: boolean;
  syncInterval: SyncInterval;
};

const REQUIRED_FIELDS = [
  'sourceProvider',
  'sourcePlaylistId',
  'targetProvider',
  'targetPlaylistId',
  'direction',
] as const;

function hasMissingRequiredFields(body: Record<string, unknown>): boolean {
  return REQUIRED_FIELDS.some((field) => !body[field]);
}

function normalizeSyncInterval(value: unknown): SyncInterval | null {
  const syncInterval = value === undefined ? 'off' : String(value);
  const validIntervals: Set<string> = new Set(['off', ...serverEnv.SYNC_INTERVAL_OPTIONS]);
  return validIntervals.has(syncInterval) ? (syncInterval as SyncInterval) : null;
}

function normalizeAutoSync(value: unknown): boolean | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    return null;
  }

  return value;
}

function normalizeCreateSyncPairBody(rawBody: unknown): { error: string } | { value: CreateSyncPairBody } {
  const body = (rawBody ?? {}) as Record<string, unknown>;

  if (hasMissingRequiredFields(body)) {
    return {
      error: 'Missing required fields: sourceProvider, sourcePlaylistId, targetProvider, targetPlaylistId, direction',
    };
  }

  if (!isValidDirection(body.direction)) {
    return {
      error: `Invalid direction: ${String(body.direction)}. Must be one of: a-to-b, b-to-a, bidirectional`,
    };
  }

  const sourceProvider = String(body.sourceProvider);
  const targetProvider = String(body.targetProvider);

  if (sourceProvider === targetProvider) {
    return { error: 'Sync requires two different providers' };
  }

  const syncInterval = normalizeSyncInterval(body.syncInterval);
  if (!syncInterval) {
    return { error: 'Invalid syncInterval' };
  }

  const autoSync = normalizeAutoSync(body.autoSync);
  if (autoSync === null) {
    return { error: 'autoSync must be a boolean' };
  }

  const normalizedBody: CreateSyncPairBody = {
    sourceProvider,
    sourcePlaylistId: String(body.sourcePlaylistId),
    sourcePlaylistName: String(body.sourcePlaylistName ?? ''),
    targetProvider,
    targetPlaylistId: String(body.targetPlaylistId),
    targetPlaylistName: String(body.targetPlaylistName ?? ''),
    direction: body.direction,
    syncInterval,
    ...(autoSync === undefined ? {} : { autoSync }),
  };

  return {
    value: normalizedBody,
  };
}

/**
 * GET /api/sync/pairs
 *
 * List all saved sync pairs for the authenticated user.
 */
export async function GET() {
  try {
    const session = await assertAuthenticated();
    const pairs = listSyncPairs(getAllSessionUserIds(session));
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
    const sessionUserIds = getAllSessionUserIds(session);
    const parsedBody = normalizeCreateSyncPairBody(await request.json());

    if ('error' in parsedBody) {
      return badRequest(parsedBody.error);
    }

    const body = parsedBody.value;

    const maxSyncTasksPerUser = serverEnv.SYNC_MAX_TASKS_PER_USER;
    if (maxSyncTasksPerUser) {
      const currentSyncTasks = listSyncPairs(sessionUserIds).length;
      if (currentSyncTasks >= maxSyncTasksPerUser) {
        return conflict(
          'Sync task limit reached',
          `Maximum ${maxSyncTasksPerUser} sync tasks allowed per user`,
        );
      }
    }

    const pair = createSyncPair({
      sourceProvider: parseMusicProviderId(body.sourceProvider),
      sourcePlaylistId: body.sourcePlaylistId,
      sourcePlaylistName: body.sourcePlaylistName,
      targetProvider: parseMusicProviderId(body.targetProvider),
      targetPlaylistId: body.targetPlaylistId,
      targetPlaylistName: body.targetPlaylistName,
      direction: body.direction,
      createdBy: getCreatorUserId(session),
      providerUserIds: getProviderUserIds(session),
      syncInterval: body.syncInterval,
      ...(body.autoSync === undefined ? {} : { autoSync: body.autoSync }),
    });

    return created({ pair });
  } catch (error) {
    console.error('[api/sync/pairs] POST Error:', error);
    return fromError(error);
  }
}
