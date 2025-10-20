import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { spotifyFetch } from '@/lib/spotify/client';

/**
 * GET /api/playlists/[id]
 *
 * Fetches playlist metadata (name, owner, collaborative status, total tracks).
 * Used by panels to display playlist information without fetching full track list.
 *
 * Returns: { id, name, owner, collaborative, tracksTotal }
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

    const { id: playlistId } = await params;

    if (!playlistId || typeof playlistId !== 'string') {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    // Fetch playlist metadata
    const path = `/playlists/${encodeURIComponent(playlistId)}`;
    const fields = 'id,name,owner(id,display_name),collaborative,tracks(total)';

    const res = await spotifyFetch(`${path}?fields=${encodeURIComponent(fields)}`, {
      method: 'GET',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[api/playlists] GET ${path} failed: ${res.status} ${text}`);

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

    // Format response
    const response = {
      id: playlist.id,
      name: playlist.name,
      owner: {
        id: playlist.owner?.id,
        displayName: playlist.owner?.display_name,
      },
      collaborative: playlist.collaborative ?? false,
      tracksTotal: playlist.tracks?.total ?? 0,
    };

    return NextResponse.json(response);
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
