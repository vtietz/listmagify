import { NextRequest, NextResponse } from 'next/server';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
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

    const { provider } = resolveMusicProviderFromRequest(request);
    const page = await provider.getLikedTracks(limit, nextCursor);

    // Log metrics (fire-and-forget, non-blocking)
    logLikedTracksFetch(page.tracks.length).catch(() => {});

    return NextResponse.json({
      tracks: page.tracks,
      total: page.total,
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    if (error instanceof ProviderApiError) {
      if (error.status === 401) {
        return NextResponse.json({ error: 'token_expired' }, { status: 401 });
      }

      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
