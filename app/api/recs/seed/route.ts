import { NextRequest, NextResponse } from 'next/server';
import { 
  isRecsAvailable,
} from '@/lib/recs';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { isAppRouteError } from '@/lib/errors';
import { getSeedRecs } from '@/lib/services/recommendationService';

function parseSeedQueryParams(searchParams: URLSearchParams) {
  const seedTrackIds = searchParams.get('seedTrackIds')?.split(',').filter(Boolean) ?? [];

  if (seedTrackIds.length === 0) {
    return {
      empty: true as const,
      payload: null,
    };
  }

  return {
    empty: false as const,
    payload: {
      seedTrackIds,
      excludeTrackIds: searchParams.get('excludeTrackIds')?.split(',').filter(Boolean) ?? [],
      playlistId: searchParams.get('playlistId') ?? undefined,
      topN: searchParams.get('topN') ?? '20',
      includeMetadata: searchParams.get('includeMetadata') !== 'false',
    },
  };
}

/**
 * POST /api/recs/seed
 * 
 * Get recommendations based on seed tracks.
 * Request body:
 * {
 *   seedTrackIds: string[],        // Required: 1-5 seed tracks
 *   excludeTrackIds?: string[],    // Optional: tracks to exclude (e.g., playlist tracks)
 *   playlistId?: string,           // Optional: for context-aware dismissals
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

    // Check if recommendations are enabled
    if (!isRecsAvailable()) {
      return NextResponse.json({
        recommendations: [],
        enabled: false,
        message: 'Recommendation system is not enabled',
      });
    }

    const recommendations = await getSeedRecs(await request.json(), providerId);

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

    console.error('[api/recs/seed] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/recs/seed?seedTrackIds=id1,id2&excludeTrackIds=id3,id4&playlistId=xxx&topN=20
 * 
 * Alternative GET endpoint for simpler use cases.
 */
export async function GET(request: NextRequest) {
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

    const parsed = parseSeedQueryParams(request.nextUrl.searchParams);
    if (parsed.empty) {
      return NextResponse.json({
        recommendations: [],
        enabled: true,
        message: 'No seed tracks provided',
      });
    }

    const recommendations = await getSeedRecs(parsed.payload, providerId);

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

    console.error('[api/recs/seed] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
