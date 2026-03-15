import { NextRequest, NextResponse } from 'next/server';
import { 
  isRecsAvailable,
} from '@/lib/recs';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { isAppRouteError } from '@/lib/errors';
import { getAppendixRecs } from '@/lib/services/recommendationService';

/**
 * POST /api/recs/playlist-appendix
 * 
 * Get recommendations to append to a playlist.
 * Request body:
 * {
 *   playlistId: string,            // Required: playlist ID
 *   trackIds: string[],            // Required: current playlist track IDs
 *   topN?: number,                 // Optional: max results (default: 20)
 *   includeMetadata?: boolean      // Optional: include full track metadata (default: true)
 * }
 * 
 * Response:
 * {
 *   recommendations: Array<{
 *     trackId: string,
 *     score: number,
 *     rank: number,
 *     track?: Track
 *   }>,
 *   enabled: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    await assertAuthenticated();
    const { providerId } = resolveMusicProviderFromRequest(request);

    if (!isRecsAvailable()) {
      return NextResponse.json({
        recommendations: [],
        enabled: false,
        message: 'Recommendation system is not enabled',
      });
    }

    const body = await request.json();
    const trackIds = Array.isArray(body?.trackIds) ? body.trackIds : [];

    if (trackIds.length === 0) {
      return NextResponse.json({
        recommendations: [],
        enabled: true,
        message: 'trackIds is required - provide the current playlist tracks',
      });
    }

    const recommendations = await getAppendixRecs(body, providerId);

    return NextResponse.json({
      recommendations,
      enabled: true,
    });

  } catch (error) {
    if (isAppRouteError(error) && error.status === 401) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if (isAppRouteError(error) && error.status === 400) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[api/recs/playlist-appendix] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
