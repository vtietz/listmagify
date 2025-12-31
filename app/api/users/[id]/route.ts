import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { spotifyFetch } from '@/lib/spotify/client';

/**
 * GET /api/users/[id]
 * 
 * Fetches a Spotify user's public profile.
 * Returns: { id, displayName, imageUrl }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if ((session as any).error === 'RefreshAccessTokenError') {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    const { id: userId } = await params;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const res = await spotifyFetch(`/users/${encodeURIComponent(userId)}`, {
      method: 'GET',
    });

    if (!res.ok) {
      // User not found or other error - return minimal info
      if (res.status === 404) {
        return NextResponse.json({
          id: userId,
          displayName: null,
          imageUrl: null,
        });
      }

      if (res.status === 401) {
        return NextResponse.json({ error: 'token_expired' }, { status: 401 });
      }

      return NextResponse.json(
        { error: `Failed to fetch user: ${res.status}` },
        { status: res.status }
      );
    }

    const user = await res.json();

    return NextResponse.json({
      id: user.id,
      displayName: user.display_name || null,
      imageUrl: user.images?.[0]?.url || null,
    });
  } catch (error) {
    console.error('[api/users] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
