import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { isAppRouteError } from '@/lib/errors';
import { assertLastfmAvailable, mapLastfmError, matchTracks } from '@/lib/services/lastfmService';

/**
 * POST /api/lastfm/match
 * 
 * Match imported tracks to Spotify tracks.
 * Request body:
 * {
 *   tracks: ImportedTrackDTO[],  // Tracks to match
 *   limit?: number               // Max Spotify results per track (default 5)
 * }
 * 
 * Response:
 * {
 *   results: MatchResult[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    await assertAuthenticated();
    assertLastfmAvailable();

    const payload = await request.json();
    const result = await matchTracks(payload);

    return NextResponse.json(result);
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
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } catch {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
}
