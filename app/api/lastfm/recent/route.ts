import { NextRequest, NextResponse } from 'next/server';
import { lastfmErrorResponse } from '@/app/api/lastfm/_shared/errorResponse';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { assertLastfmAvailable, getRecentTracks } from '@/lib/services/lastfmService';

/**
 * GET /api/lastfm/recent?user=username&page=1&limit=50
 * 
 * Fetch recent tracks from a Last.fm user profile.
 * Returns normalized track DTOs with pagination metadata.
 */
export async function GET(request: NextRequest) {
  try {
    await assertAuthenticated();
    assertLastfmAvailable();
    const result = await getRecentTracks(request.nextUrl.searchParams);

    return NextResponse.json({
      enabled: true,
      ...result,
    });
  } catch (error) {
    return lastfmErrorResponse(error, request);
  }
}
