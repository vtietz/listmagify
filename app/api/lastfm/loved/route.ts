import { NextRequest, NextResponse } from 'next/server';
import { lastfmErrorResponse } from '@/app/api/lastfm/_shared/errorResponse';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { assertLastfmAvailable, getLovedTracks } from '@/lib/services/lastfmService';

/**
 * GET /api/lastfm/loved?user=username&page=1&limit=50
 * 
 * Fetch loved tracks from a Last.fm user profile.
 * Returns normalized track DTOs with pagination metadata.
 */
export async function GET(request: NextRequest) {
  try {
    await assertAuthenticated();
    assertLastfmAvailable();
    const result = await getLovedTracks(request.nextUrl.searchParams);

    return NextResponse.json({
      enabled: true,
      ...result,
    });
  } catch (error) {
    return lastfmErrorResponse(error, request);
  }
}
