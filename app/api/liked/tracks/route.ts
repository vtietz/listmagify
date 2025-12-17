import { NextRequest, NextResponse } from 'next/server';
import { spotifyFetch } from '@/lib/spotify/client';
import { mapPlaylistItemToTrack } from '@/lib/spotify/types';

/**
 * GET /api/liked/tracks?limit=50&nextCursor=...
 * 
 * Proxy to Spotify's GET /me/tracks endpoint.
 * Returns the user's saved tracks (Liked Songs) with pagination.
 * 
 * Response: { tracks: Track[], total: number, nextCursor: string | null }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const nextCursor = searchParams.get('nextCursor');

  const limit = Math.min(Math.max(parseInt(limitParam || '50', 10), 1), 50);

  // Build Spotify API URL
  let spotifyUrl: string;
  if (nextCursor) {
    // nextCursor is the full Spotify URL for the next page
    spotifyUrl = nextCursor;
  } else {
    spotifyUrl = `/me/tracks?limit=${limit}`;
  }

  const response = await spotifyFetch(spotifyUrl);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return NextResponse.json(
      { error: errorData.error?.message || 'Failed to fetch liked tracks' },
      { status: response.status }
    );
  }

  const data = await response.json();

  // Map raw Spotify items to our Track type
  const tracks = (data.items || []).map((item: any) => mapPlaylistItemToTrack(item));

  return NextResponse.json({
    tracks,
    total: data.total || 0,
    nextCursor: data.next || null,
  });
}
