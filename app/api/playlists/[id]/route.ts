import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ServerAuthError } from '@/lib/auth/requireAuth';
import { spotifyFetchWithToken } from '@/lib/spotify/client';

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
    const session = await requireAuth();

    const { id: playlistId } = await params;

    if (!playlistId || typeof playlistId !== 'string') {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    // Fetch playlist metadata
    const path = `/playlists/${encodeURIComponent(playlistId)}`;
    const fields = 'id,name,description,owner(id,display_name),collaborative,tracks(total)';

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

    // Format response
    const response = {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description ?? '',
      owner: {
        id: playlist.owner?.id,
        displayName: playlist.owner?.display_name,
      },
      collaborative: playlist.collaborative ?? false,
      tracksTotal: playlist.tracks?.total ?? 0,
    };

    return NextResponse.json(response);
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

    const { id: playlistId } = await params;

    if (!playlistId || typeof playlistId !== 'string') {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, isPublic } = body;

    // Build the update payload - only include fields that were provided
    const updatePayload: Record<string, unknown> = {};
    if (typeof name === 'string') {
      if (name.trim().length === 0) {
        return NextResponse.json({ error: 'Playlist name cannot be empty' }, { status: 400 });
      }
      updatePayload.name = name.trim();
    }
    if (typeof description === 'string') {
      updatePayload.description = description;
    }
    if (typeof isPublic === 'boolean') {
      updatePayload.public = isPublic;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Update the playlist
    const path = `/playlists/${encodeURIComponent(playlistId)}`;
    const res = await spotifyFetchWithToken(session.accessToken, path, {
      method: 'PUT',
      body: JSON.stringify(updatePayload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[api/playlists] PUT ${path} failed: ${res.status} ${text}`);

      if (res.status === 401) {
        return NextResponse.json({ error: 'token_expired' }, { status: 401 });
      }

      if (res.status === 403) {
        return NextResponse.json({ error: 'You do not have permission to edit this playlist' }, { status: 403 });
      }

      if (res.status === 404) {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
      }

      return NextResponse.json(
        { error: `Failed to update playlist: ${res.status} ${res.statusText}` },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // Handle auth errors consistently
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
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
}
