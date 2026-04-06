import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { badRequest, fromError } from '@/app/api/_shared/http';
import { parseMusicProviderId } from '@/lib/music-provider';
import { getMusicProvider } from '@/lib/music-provider';
import { executePreviewRun } from '@/lib/sync/runner';
import { getAllSessionUserIds, getCreatorUserId } from '@/lib/auth/sessionUserIds';
import { getProviderUserIds } from '@/lib/auth/sessionUserIds';
import type { SyncDirection } from '@/lib/sync/types';
import type { SyncMatchThresholds } from '@/lib/sync/executor';
import { normalizeConvertThreshold, deriveManualThreshold } from '@/lib/matching/config';
import { getSyncPair } from '@/lib/sync/syncStore';
import { createSyncPreviewRun } from '@/lib/sync/previewStore';
import { NextResponse } from 'next/server';
import { isLikedSongsPlaylist } from '@/lib/sync/likedSongs';
import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';

const VALID_DIRECTIONS = new Set<SyncDirection>(['a-to-b', 'b-to-a', 'bidirectional']);
const LARGE_PREVIEW_TRACK_THRESHOLD = 400;

function isValidDirection(value: unknown): value is SyncDirection {
  return typeof value === 'string' && VALID_DIRECTIONS.has(value as SyncDirection);
}

function parseMatchThresholds(body: Record<string, unknown>): SyncMatchThresholds | undefined {
  const raw = body.matchThresholds;
  if (!raw || typeof raw !== 'object') return undefined;

  const obj = raw as Record<string, unknown>;
  if (typeof obj.convert !== 'number') return undefined;

  const convert = normalizeConvertThreshold(obj.convert);
  const manual = deriveManualThreshold(convert);
  return { convert, manual };
}

async function estimatePlaylistSize(
  provider: MusicProvider,
  playlistId: string,
): Promise<number> {
  if (isLikedSongsPlaylist(playlistId)) {
    const liked = await provider.getLikedTracks(1);
    return liked.total;
  }

  const details = await provider.getPlaylistDetails(playlistId, 'tracks.total');
  return details.tracksTotal;
}

async function shouldQueuePreviewToWorker(config: {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
}): Promise<boolean> {
  if (isLikedSongsPlaylist(config.sourcePlaylistId) || isLikedSongsPlaylist(config.targetPlaylistId)) {
    return true;
  }

  try {
    const sourceProvider = getMusicProvider(config.sourceProvider);
    const targetProvider = getMusicProvider(config.targetProvider);

    const [sourceSize, targetSize] = await Promise.all([
      estimatePlaylistSize(sourceProvider, config.sourcePlaylistId),
      estimatePlaylistSize(targetProvider, config.targetPlaylistId),
    ]);

    return sourceSize + targetSize > LARGE_PREVIEW_TRACK_THRESHOLD;
  } catch {
    // If size estimation fails, keep previews robust by preferring worker execution.
    return true;
  }
}

/**
 * POST /api/sync/preview
 *
 * Preview a sync diff without applying changes.
 *
 * Accepts either an inline config:
 *   { sourceProvider, sourcePlaylistId, targetProvider, targetPlaylistId, direction, matchThresholds? }
 *
 * Or a saved pair reference:
 *   { syncPairId, matchThresholds? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await assertAuthenticated();

    const body = await request.json();
    const matchThresholds = parseMatchThresholds(body);

    let config: {
      sourceProvider: 'spotify' | 'tidal';
      sourcePlaylistId: string;
      targetProvider: 'spotify' | 'tidal';
      targetPlaylistId: string;
      direction: SyncDirection;
    };

    // Pair-based preview
    if (body.syncPairId) {
      if (typeof body.syncPairId !== 'string') {
        return badRequest('syncPairId must be a string');
      }

      const pair = getSyncPair(body.syncPairId, getAllSessionUserIds(session));
      if (!pair) {
        return badRequest('Sync pair not found');
      }

      config = {
        sourceProvider: pair.sourceProvider,
        sourcePlaylistId: pair.sourcePlaylistId,
        targetProvider: pair.targetProvider,
        targetPlaylistId: pair.targetPlaylistId,
        direction: pair.direction,
      };
    } else {
      // Inline config preview
      if (!body.sourceProvider || !body.sourcePlaylistId || !body.targetProvider || !body.targetPlaylistId || !body.direction) {
        return badRequest('Missing required fields: sourceProvider, sourcePlaylistId, targetProvider, targetPlaylistId, direction');
      }

      if (!isValidDirection(body.direction)) {
        return badRequest(`Invalid direction: ${body.direction}. Must be one of: a-to-b, b-to-a, bidirectional`);
      }

      config = {
        sourceProvider: parseMusicProviderId(body.sourceProvider),
        sourcePlaylistId: String(body.sourcePlaylistId),
        targetProvider: parseMusicProviderId(body.targetProvider),
        targetPlaylistId: String(body.targetPlaylistId),
        direction: body.direction as SyncDirection,
      };
    }

    const providerUserIds = getProviderUserIds(session);
    const run = createSyncPreviewRun(getCreatorUserId(session), config, matchThresholds, providerUserIds);

    const shouldQueue = await shouldQueuePreviewToWorker(config);
    if (!shouldQueue) {
      // Keep small previews snappy by executing in web process.
      executePreviewRun(run.id, config, matchThresholds, providerUserIds).catch((error) => {
        console.error('[api/sync/preview] inline preview failed', {
          runId: run.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return NextResponse.json({ previewRunId: run.id }, { status: 202 });
  } catch (error) {
    console.error('[api/sync/preview] Error:', error);
    return fromError(error);
  }
}
