import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ServerAuthError } from '@/lib/auth/requireAuth';
import { spotifyFetchWithToken } from '@/lib/spotify/client';
import { parsePlaylistId, parsePlaylistUpdatePayload } from '@/lib/services/spotifyPlaylistService';
import { getPlaylistFieldsQuery, mapPlaylistMetadata } from '@/lib/repositories/playlistRepository';

function mapPlaylistPutResponseError(status: number, statusText: string): NextResponse {
  if (status === 401) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  if (status === 403) {
    return NextResponse.json({ error: 'You do not have permission to edit this playlist' }, { status: 403 });
  }

  if (status === 404) {
    return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
  }

  return NextResponse.json(
    { error: `Failed to update playlist: ${status} ${statusText}` },
    { status }
  );
}

function mapPlaylistPutThrownError(error: unknown): NextResponse {
  if (error instanceof ServerAuthError) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  if (error instanceof Error && error.message.includes('Invalid playlist ID')) {
    return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
  }

  if (error instanceof Error && (error.message.includes('No fields to update') || error.message.includes('cannot be empty'))) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error('[api/playlists] PUT Error:', error);

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

/**
 * GET /api/playlists/[id]
 *
 * Fetches playlist metadata (name, owner, collaborative status, total tracks, public status).
 * Used by panels to display playlist information without fetching full track list.
 *
 * Returns: { id, name, owner, collaborative, tracksTotal, isPublic }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();

    const { id } = await params;
    const playlistId = parsePlaylistId(id);

    const path = `/playlists/${encodeURIComponent(playlistId)}`;
    const fields = getPlaylistFieldsQuery();

    const res = await spotifyFetchWithToken(session.accessToken, `${path}?fields=${encodeURIComponent(fields)}`, {
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
    return NextResponse.json(mapPlaylistMetadata(playlist));
  } catch (error) {
    // Handle auth errors consistently
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

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

/**
 * PUT /api/playlists/[id]
 *
 * Updates playlist details (name, description, public status).
 * Only the playlist owner can update the playlist.
 *
 * Request body:
 * - name: string (optional) - New name for the playlist
 * - description: string (optional) - New description for the playlist
 * - isPublic: boolean (optional) - Whether the playlist should be public
 *
 * Returns: { success: true }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();

    const { id } = await params;
    const playlistId = parsePlaylistId(id);
    const updatePayload = parsePlaylistUpdatePayload(await request.json());

    // Update the playlist
    const path = `/playlists/${encodeURIComponent(playlistId)}`;
    const res = await spotifyFetchWithToken(session.accessToken, path, {
      method: 'PUT',
      body: JSON.stringify(updatePayload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[api/playlists] PUT ${path} failed: ${res.status} ${text}`);
      return mapPlaylistPutResponseError(res.status, res.statusText);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return mapPlaylistPutThrownError(error);
  }
}
