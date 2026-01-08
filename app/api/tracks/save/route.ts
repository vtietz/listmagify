import { NextRequest, NextResponse } from 'next/server';
import { spotifyFetch } from '@/lib/spotify/client';

/**
 * PUT /api/tracks/save
 * Body: { ids: string[] }
 * 
 * Proxy to Spotify's PUT /me/tracks endpoint.
 * Saves tracks to user's "Liked Songs" library.
 * Max 50 IDs per request (Spotify limit).
 */
export async function PUT(request: NextRequest) {
  let body: { ids?: string[] };
  
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { ids } = body;

  if (!ids || !Array.isArray(ids)) {
    return NextResponse.json(
      { error: 'Missing or invalid ids array' },
      { status: 400 }
    );
  }

  if (ids.length === 0) {
    return NextResponse.json({ success: true });
  }

  if (ids.length > 50) {
    return NextResponse.json(
      { error: 'Maximum 50 IDs per request' },
      { status: 400 }
    );
  }

  // Validate all IDs are non-empty strings
  if (ids.some(id => typeof id !== 'string' || id.trim() === '')) {
    return NextResponse.json(
      { error: 'Invalid ID format' },
      { status: 400 }
    );
  }

  // Spotify's PUT /me/tracks expects IDs in query string
  const response = await spotifyFetch(
    `/me/tracks?ids=${ids.join(',')}`,
    { method: 'PUT' }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[api/tracks/save] Spotify API error:', {
      status: response.status,
      statusText: response.statusText,
      idsCount: ids.length,
      error: errorData,
    });
    return NextResponse.json(
      { error: errorData.error?.message || errorData.message || `Spotify API error: ${response.status}` },
      { status: response.status }
    );
  }

  return NextResponse.json({ success: true });
}
