import { NextRequest, NextResponse } from 'next/server';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { isAppRouteError } from '@/lib/errors';
import { logLikedTracksFetch } from '@/lib/metrics/api-helpers';
import { ProviderApiError } from '@/lib/music-provider/types';

/**
 * GET /api/liked/tracks?limit=50&nextCursor=...
 * 
 * Returns the user's saved tracks with pagination.
 * 
 * Response: { tracks: Track[], total: number, nextCursor: string | null }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const nextCursor = searchParams.get('nextCursor');
    const limit = Math.min(Math.max(parseInt(limitParam || '50', 10), 1), 50);

    const { providerId, provider } = resolveMusicProviderFromRequest(request);

    if (providerId !== 'spotify') {
      return NextResponse.json({
        tracks: [],
        total: 0,
        nextCursor: null,
      });
    }

    const page = await provider.getLikedTracks(limit, nextCursor);

    // Log metrics (fire-and-forget, non-blocking)
    logLikedTracksFetch(page.tracks.length).catch(() => {});

    return NextResponse.json({
      tracks: page.tracks,
      total: page.total,
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
    if (authError) {
      return toProviderAuthErrorResponse(authError);
    }

    if (error instanceof ProviderApiError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }

    if (isAppRouteError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          detail: error.detail,
          type: error.type,
        },
        { status: error.status }
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
