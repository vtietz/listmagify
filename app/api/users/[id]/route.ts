import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { isAppRouteError } from '@/lib/errors';
import { spotifyFetch } from '@/lib/spotify/client';

function mapFallbackUser(userId: string) {
  return {
    id: userId,
    displayName: null,
    imageUrl: null,
  };
}

function mapUserResponse(user: any) {
  return {
    id: user.id,
    displayName: user.display_name || null,
    imageUrl: user.images?.[0]?.url || null,
  };
}

/**
 * GET /api/users/[id]
 * 
 * Fetches a Spotify user's public profile.
 * Returns: { id, displayName, imageUrl }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertAuthenticated();

    const { id: userId } = await params;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const res = await spotifyFetch(`/users/${encodeURIComponent(userId)}`, {
      method: 'GET',
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json(mapFallbackUser(userId));
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
    return NextResponse.json(mapUserResponse(user));
  } catch (error) {
    if (isAppRouteError(error) && error.status === 401) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    console.error('[api/users] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
