import { NextRequest, NextResponse } from 'next/server';
import { lastfmErrorResponse } from '@/app/api/lastfm/_shared/errorResponse';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { assertLastfmAvailable, getWeeklyTracks } from '@/lib/services/lastfmService';

/**
 * GET /api/lastfm/weekly?user=username&from=timestamp&to=timestamp
 * 
 * Fetch weekly track chart from a Last.fm user profile.
 * Returns normalized track DTOs.
 */
export async function GET(request: NextRequest) {
  try {
    await assertAuthenticated();
    assertLastfmAvailable();
    const result = await getWeeklyTracks(request.nextUrl.searchParams);

    return NextResponse.json({
      enabled: true,
      ...result,
    });
  } catch (error) {
    return lastfmErrorResponse(error, request);
  }
}
