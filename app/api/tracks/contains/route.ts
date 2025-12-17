import { NextRequest, NextResponse } from 'next/server';
import { spotifyFetch } from '@/lib/spotify/client';

/**
 * GET /api/tracks/contains?ids=id1,id2,...
 * 
 * Proxy to Spotify's GET /me/tracks/contains endpoint.
 * Returns boolean[] indicating whether each track is saved to user's library.
 * Max 50 IDs per request (Spotify limit).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');

  if (!idsParam) {
    return NextResponse.json(
      { error: 'Missing ids parameter' },
      { status: 400 }
    );
  }

  const ids = idsParam.split(',').filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  if (ids.length > 50) {
    return NextResponse.json(
      { error: 'Maximum 50 IDs per request' },
      { status: 400 }
    );
  }

  // Validate all IDs are strings (no empty values)
  if (ids.some(id => typeof id !== 'string' || id.trim() === '')) {
    return NextResponse.json(
      { error: 'Invalid ID format' },
      { status: 400 }
    );
  }

  const response = await spotifyFetch(
    `/me/tracks/contains?ids=${ids.join(',')}`
  );

  const data = await response.json();
  return NextResponse.json(data);
}
