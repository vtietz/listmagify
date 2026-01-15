import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { spotifyFetch } from '@/lib/spotify/client';
import { mapPlaylistItemToTrack, type Track } from '@/lib/spotify/types';

/**
 * GET /api/search/tracks?q=query&limit=50&offset=0
 * 
 * Search for tracks on Spotify.
 * Returns normalized tracks matching the search query.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if ((session as any).error === 'RefreshAccessTokenError') {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 50);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    if (!query || query.trim().length === 0) {
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
    const { handleSpotifyException } = await import('@/lib/api/spotifyErrorHandler');
    return handleSpotifyException(error, {
      operation: 'api/search/tracks'
    });
  }
}
