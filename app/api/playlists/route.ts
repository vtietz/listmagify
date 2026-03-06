import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ServerAuthError } from '@/lib/auth/requireAuth';
import { spotifyFetch } from '@/lib/spotify/client';
import { handleApiError } from '@/lib/api/errorHandler';

interface CreatePlaylistInput {
  name: string;
  description: string;
  isPublic: boolean;
}

function parseCreatePlaylistBody(body: any): CreatePlaylistInput | null {
  if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return null;
  }

  return {
    name: body.name.trim(),
    description: typeof body.description === 'string' ? body.description.trim() : '',
    isPublic: Boolean(body.isPublic ?? false),
  };
}

async function fetchCurrentUser() {
  const response = await spotifyFetch('/me', { method: 'GET' });

  if (!response.ok) {
    if (response.status === 401) {
      return { error: NextResponse.json({ error: 'token_expired' }, { status: 401 }) };
    }

    return {
      error: NextResponse.json(
        { error: 'Failed to get user info' },
        { status: response.status }
      ),
    };
  }

  return { data: await response.json() };
}

async function createPlaylist(userId: string, input: CreatePlaylistInput) {
  const response = await spotifyFetch(`/users/${encodeURIComponent(userId)}/playlists`, {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      public: input.isPublic,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      return { error: NextResponse.json({ error: 'token_expired' }, { status: 401 }) };
    }

    return {
      error: NextResponse.json(
        { error: `Failed to create playlist: ${response.status} ${response.statusText}` },
        { status: response.status }
      ),
    };
  }

  return { data: await response.json() };
}

function toPlaylistResponse(playlist: any, meData: any) {
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description ?? '',
    isPublic: playlist.public,
    ownerName: playlist.owner?.display_name ?? meData.display_name ?? null,
    image: playlist.images?.[0] ?? null,
    tracksTotal: playlist.tracks?.total ?? 0,
  };
}

function mapPlaylistsPostError(error: unknown): NextResponse {
  if (error instanceof ServerAuthError) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  return handleApiError(error);
}

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
    await requireAuth();

    const body = await request.json();
    const input = parseCreatePlaylistBody(body);
    if (!input) {
      return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 });
    }

    const currentUser = await fetchCurrentUser();
    if (currentUser.error) {
      return currentUser.error;
    }

    const created = await createPlaylist(currentUser.data.id, input);
    if (created.error) {
      return created.error;
    }

    const playlist = created.data;
    const meData = currentUser.data;

    return NextResponse.json(toPlaylistResponse(playlist, meData));
  } catch (error) {
    return mapPlaylistsPostError(error);
  }
}
