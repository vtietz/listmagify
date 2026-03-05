import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { isAppRouteError } from '@/lib/errors';
import { assertLastfmAvailable, getWeeklyTracks, mapLastfmError } from '@/lib/services/lastfmService';

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
    if (isAppRouteError(error) && error.status === 401) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if (isAppRouteError(error) && error.status === 503) {
      return NextResponse.json({ error: 'Last.fm import is not enabled', enabled: false }, { status: 503 });
    }

    if (isAppRouteError(error) && error.status === 400) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    try {
      mapLastfmError(error);
      return NextResponse.json({ error: 'Internal server error', retryable: false }, { status: 500 });
    } catch (mapped) {
      if (isAppRouteError(mapped) && mapped.status === 429) {
        return NextResponse.json({ error: mapped.message, retryable: true }, { status: 429 });
      }

      return NextResponse.json({ error: mapped instanceof Error ? mapped.message : 'Internal server error', retryable: false }, { status: 500 });
    }
  }
}
