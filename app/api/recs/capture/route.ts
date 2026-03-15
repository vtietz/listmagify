import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { isAppRouteError } from '@/lib/errors';
import { 
  isRecsAvailable, 
  captureAndUpdateEdges,
  type PlaylistSnapshotInput 
} from '@/lib/recs';
import type { Track } from '@/lib/music-provider/types';

/**
 * POST /api/recs/capture
 * 
 * Capture a playlist snapshot and update recommendation edges.
 * Request body:
 * {
 *   playlistId: string,
 *   tracks: Track[]      // Full track objects with id, uri, artistObjects, album, etc.
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   stats: {
 *     tracksCapture: number,
 *     adjacencyEdges: number,
 *     cooccurrenceEdges: number
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    await assertAuthenticated();

    if (!isRecsAvailable()) {
      return NextResponse.json({
        success: false,
        enabled: false,
        message: 'Recommendation system is not enabled',
      });
    }

    const body = await request.json();
    const { playlistId, tracks, cooccurrenceOnly } = body;

    if (!playlistId || typeof playlistId !== 'string') {
      return NextResponse.json(
        { error: 'playlistId is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(tracks)) {
      return NextResponse.json(
        { error: 'tracks must be an array' },
        { status: 400 }
      );
    }

    const input: PlaylistSnapshotInput = {
      playlistId,
      tracks: tracks as Track[],
      cooccurrenceOnly: cooccurrenceOnly === true,
    };

    const stats = captureAndUpdateEdges(input);

    return NextResponse.json({
      success: true,
      enabled: true,
      stats,
    });

  } catch (error) {
    if (isAppRouteError(error) && error.status === 401) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    console.error('[api/recs/capture] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
