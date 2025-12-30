import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { spotifyFetch } from '@/lib/spotify/client';

/**
 * POST /api/playlists
 *
 * Creates a new playlist for the current user.
 * 
 * Request body:
 * - name: string (required) - Name of the playlist
 * - description: string (optional) - Description of the playlist
 * - isPublic: boolean (optional, default: false) - Whether the playlist is public
 *
 * Returns: { id, name, description, isPublic }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if ((session as any).error === 'RefreshAccessTokenError') {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, isPublic = false } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 });
    }

    // First, get the current user's ID
    const meRes = await spotifyFetch('/me', { method: 'GET' });
    if (!meRes.ok) {
      if (meRes.status === 401) {
        return NextResponse.json({ error: 'token_expired' }, { status: 401 });
      }
      const text = await meRes.text().catch(() => '');
      console.error(`[api/playlists] GET /me failed: ${meRes.status} ${text}`);
      return NextResponse.json(
        { error: 'Failed to get user info' },
        { status: meRes.status }
      );
    }

    const meData = await meRes.json();
    const userId = meData.id;

    // Create the playlist
    const createRes = await spotifyFetch(`/users/${encodeURIComponent(userId)}/playlists`, {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        description: description?.trim() || '',
        public: isPublic,
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text().catch(() => '');
      console.error(`[api/playlists] POST /users/${userId}/playlists failed: ${createRes.status} ${text}`);

      if (createRes.status === 401) {
        return NextResponse.json({ error: 'token_expired' }, { status: 401 });
      }

      return NextResponse.json(
        { error: `Failed to create playlist: ${createRes.status} ${createRes.statusText}` },
        { status: createRes.status }
      );
    }

    const playlist = await createRes.json();

    return NextResponse.json({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      isPublic: playlist.public,
    });
  } catch (error) {
    console.error('[api/playlists] Error:', error);

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
