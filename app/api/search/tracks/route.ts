import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { isAppRouteError } from '@/lib/errors';
import { spotifyFetch } from '@/lib/spotify/client';
import { mapPlaylistItemToTrack, type Track } from '@/lib/spotify/types';

const querySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function parseSearchQuery(searchParams: URLSearchParams) {
  return querySchema.parse({
    q: searchParams.get('q') ?? undefined,
    limit: searchParams.get('limit') ?? '50',
    offset: searchParams.get('offset') ?? '0',
  });
}

function tokenExpiredResponse() {
  return NextResponse.json({ error: 'token_expired' }, { status: 401 });
}

/**
 * GET /api/search/tracks?q=query&limit=50&offset=0
 * 
 * Search for tracks on Spotify.
 * Returns normalized tracks matching the search query.
 */
export async function GET(request: NextRequest) {
  try {
    await assertAuthenticated();

    const { q, limit, offset } = parseSearchQuery(request.nextUrl.searchParams);
    const query = q?.trim() ?? '';

    if (query.length === 0) {
      return NextResponse.json({
        tracks: [],
        total: 0,
        nextOffset: null,
      });
    }

    // Build Spotify search URL
    const spotifyUrl = `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&offset=${offset}`;

    const response = await spotifyFetch(spotifyUrl);

    if (!response.ok) {
      const { handleSpotifyResponseError } = await import('@/lib/api/spotifyErrorHandler');
      return handleSpotifyResponseError(response, {
        operation: 'api/search/tracks',
        path: spotifyUrl,
        context: { query, limit, offset }
      });
    }

    const data = await response.json();

    // Map raw Spotify items to our Track type
    const tracks: Track[] = (data.tracks?.items || []).map((item: any) =>
      mapPlaylistItemToTrack({ track: item })
    );

    const total = data.tracks?.total || 0;
    const nextOffset = offset + tracks.length < total ? offset + tracks.length : null;

    return NextResponse.json({
      tracks,
      total,
      nextOffset,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid query params' }, { status: 400 });
    }

    if (isAppRouteError(error) && error.status === 401) {
      return tokenExpiredResponse();
    }

    const { handleSpotifyException } = await import('@/lib/api/spotifyErrorHandler');
    return handleSpotifyException(error, {
      operation: 'api/search/tracks'
    });
  }
}
