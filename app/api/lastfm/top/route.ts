import { NextRequest, NextResponse } from 'next/server';
import { lastfmErrorResponse } from '@/app/api/lastfm/_shared/errorResponse';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { assertLastfmAvailable, getTopTracks } from '@/lib/services/lastfmService';

/**
 * GET /api/lastfm/top?user=username&period=overall&page=1&limit=50
 * 
 * Fetch top tracks from a Last.fm user profile.
 * Returns normalized track DTOs with pagination metadata.
 */
export async function GET(request: NextRequest) {
  try {
    await assertAuthenticated();
    assertLastfmAvailable();
    const { period, result } = await getTopTracks(request.nextUrl.searchParams);

    return NextResponse.json({
      enabled: true,
      period,
      ...result,
    });
  } catch (error) {
    return lastfmErrorResponse(error, request);
  }
}
