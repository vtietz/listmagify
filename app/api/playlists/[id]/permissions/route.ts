import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { spotifyFetch } from '@/lib/spotify/client';

/**
 * GET /api/playlists/[id]/permissions
 *
 * Checks if the current user can edit the playlist.
 * A playlist is editable if the user is the owner or has been granted collaborative access.
 *
 * Returns: { isEditable: boolean }
 */
export async function GET(
  _request: NextRequest,
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

    const { id: playlistId } = await params;

    if (!playlistId || typeof playlistId !== 'string') {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    // Fetch playlist details to check ownership and collaborative status
    const path = `/playlists/${encodeURIComponent(playlistId)}`;
    const fields = 'owner.id,collaborative';

    const res = await spotifyFetch(`${path}?fields=${encodeURIComponent(fields)}`, {
      method: 'GET',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[api/playlists/permissions] GET ${path} failed: ${res.status} ${text}`);

      if (res.status === 401) {
        return NextResponse.json({ error: 'token_expired' }, { status: 401 });
      }

      if (res.status === 404) {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
      }

      return NextResponse.json(
        { error: `Failed to fetch playlist: ${res.status} ${res.statusText}` },
        { status: res.status }
      );
    }

    const playlist = await res.json();

    // Get current user's ID
    const userRes = await spotifyFetch('/me', { method: 'GET' });

    if (!userRes.ok) {
      console.error(`[api/playlists/permissions] Failed to fetch user: ${userRes.status}`);
      return NextResponse.json({ error: 'Failed to fetch user info' }, { status: userRes.status });
    }

    const user = await userRes.json();
    const userId = user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Failed to determine user ID' }, { status: 500 });
    }

    // A playlist is editable if:
    // 1. The user owns it, OR
    // 2. The playlist is collaborative
    const isOwner = playlist?.owner?.id === userId;
    const isCollaborative = playlist?.collaborative === true;
    const isEditable = isOwner || isCollaborative;

    return NextResponse.json({ isEditable });
  } catch (error) {
    console.error('[api/playlists/permissions] Error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes('401') ||
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('access token expired')
    ) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
