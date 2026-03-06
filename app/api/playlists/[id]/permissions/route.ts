import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { isAppRouteError } from '@/lib/errors';
import { spotifyFetch } from '@/lib/spotify/client';
import { parsePlaylistId } from '@/lib/services/spotifyPlaylistService';

async function fetchPlaylistPermissionData(playlistId: string) {
  const path = `/playlists/${encodeURIComponent(playlistId)}`;
  const fields = 'owner.id,collaborative';
  const response = await spotifyFetch(`${path}?fields=${encodeURIComponent(fields)}`, { method: 'GET' });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 401) {
      return { error: NextResponse.json({ error: 'token_expired' }, { status: 401 }) };
    }
    if (response.status === 404) {
      return { error: NextResponse.json({ error: 'Playlist not found' }, { status: 404 }) };
    }
    return {
      error: NextResponse.json(
        { error: `Failed to fetch playlist: ${response.status} ${response.statusText}` },
        { status: response.status }
      ),
      text,
    };
  }

  return { data: await response.json() };
}

async function fetchCurrentUserId() {
  const userResponse = await spotifyFetch('/me', { method: 'GET' });
  if (!userResponse.ok) {
    return { error: NextResponse.json({ error: 'Failed to fetch user info' }, { status: userResponse.status }) };
  }

  const user = await userResponse.json();
  if (!user?.id) {
    return { error: NextResponse.json({ error: 'Failed to determine user ID' }, { status: 500 }) };
  }

  return { userId: user.id as string };
}

function mapPermissionsError(error: unknown): NextResponse {
  if (isAppRouteError(error) && error.status === 401) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  if (isAppRouteError(error) && error.status === 400) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error('[api/playlists/permissions] Error:', error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Internal server error' },
    { status: 500 }
  );
}

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
    await assertAuthenticated();
    const { id } = await params;
    const playlistId = parsePlaylistId(id);

    const playlistResult = await fetchPlaylistPermissionData(playlistId);
    if (playlistResult.error) {
      return playlistResult.error;
    }

    const userResult = await fetchCurrentUserId();
    if (userResult.error) {
      return userResult.error;
    }

    const isOwner = playlistResult.data?.owner?.id === userResult.userId;
    const isCollaborative = playlistResult.data?.collaborative === true;
    const isEditable = isOwner || isCollaborative;

    return NextResponse.json({ isEditable });
  } catch (error) {
    return mapPermissionsError(error);
  }
}
