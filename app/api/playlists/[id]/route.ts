import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/requireAuth';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { parsePlaylistId, parsePlaylistUpdatePayload } from '@/lib/services/playlistService';
import { getPlaylistFieldsQuery, mapPlaylistMetadata } from '@/lib/repositories/playlistRepository';
import { ProviderApiError } from '@/lib/music-provider/types';

function mapPlaylistPutResponseError(status: number, statusText: string): NextResponse {
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

function mapKnownPlaylistValidationError(error: Error): NextResponse | null {
  if (error.message.includes('Invalid playlist ID')) {
    return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
  }

  if (error.message.includes('No fields to update') || error.message.includes('cannot be empty')) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return null;
}

function mapPlaylistPutThrownError(error: unknown, request: NextRequest): NextResponse {
  const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
  if (authError) {
    return toProviderAuthErrorResponse(authError);
  }

  if (error instanceof Error) {
    const validationError = mapKnownPlaylistValidationError(error);
    if (validationError) {
      return validationError;
    }
  }

  if (error instanceof ProviderApiError) {
    return mapPlaylistPutResponseError(error.status, error.message);
  }

  console.error('[api/playlists] PUT Error:', error);

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { provider } = resolveMusicProviderFromRequest(request);

    const { id } = await params;
    const playlistId = parsePlaylistId(id);

    const fields = getPlaylistFieldsQuery();
    const playlist = await provider.getPlaylistDetails(playlistId, fields);
    return NextResponse.json(mapPlaylistMetadata(playlist));
  } catch (error) {
    const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
    if (authError) {
      return toProviderAuthErrorResponse(authError);
    }

    if (error instanceof ProviderApiError) {
      if (error.status === 404) {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
      }

      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }

    console.error('[api/playlists] Error:', error);

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
    await requireAuth();
    const { provider } = resolveMusicProviderFromRequest(request);

    const { id } = await params;
    const playlistId = parsePlaylistId(id);
    const updatePayload = parsePlaylistUpdatePayload(await request.json());

    // Update the playlist
    await provider.updatePlaylistDetails(playlistId, updatePayload);

    return NextResponse.json({ success: true });
  } catch (error) {
    return mapPlaylistPutThrownError(error, request);
  }
}
