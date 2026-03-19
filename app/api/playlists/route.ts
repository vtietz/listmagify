import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/requireAuth';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { handleApiError, mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { ProviderApiError, type Playlist } from '@/lib/music-provider/types';

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

function toPlaylistResponse(playlist: Playlist, meData: { displayName: string | null }) {
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description ?? '',
    isPublic: playlist.isPublic ?? false,
    ownerName: playlist.owner?.displayName ?? meData.displayName ?? null,
    image: playlist.image ?? null,
    tracksTotal: playlist.tracksTotal ?? 0,
  };
}

function mapPlaylistsPostError(error: unknown): NextResponse {
  const authError = mapApiErrorToProviderAuthError(error);
  if (authError) {
    return toProviderAuthErrorResponse(authError);
  }

  if (error instanceof ProviderApiError) {
    return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
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
    const { provider } = resolveMusicProviderFromRequest(request);

    const body = await request.json();
    const input = parseCreatePlaylistBody(body);
    if (!input) {
      return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 });
    }

    const currentUser = await provider.getCurrentUser();
    const playlist = await provider.createPlaylist({
      userId: currentUser.id,
      name: input.name,
      description: input.description,
      isPublic: input.isPublic,
    });
    return NextResponse.json(toPlaylistResponse(playlist, currentUser));
  } catch (error) {
    return mapPlaylistsPostError(error);
  }
}
