import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { assertPlaylistProviderCompat, getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { isAppRouteError } from '@/lib/errors';
import { parsePlaylistId } from '@/lib/services/playlistService';
import { ProviderApiError } from '@/lib/music-provider/types';

async function fetchCurrentUserId(provider: ReturnType<typeof resolveMusicProviderFromRequest>['provider']) {
  const user = await provider.getCurrentUser();
  if (!user.id) {
    return { error: NextResponse.json({ error: 'Failed to determine user ID' }, { status: 500 }) };
  }

  return { userId: user.id };
}

function mapPermissionsError(error: unknown, request: NextRequest): NextResponse {
  const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
  if (authError) {
    return toProviderAuthErrorResponse(authError);
  }

  if (isAppRouteError(error) && error.status === 401) {
    const mapped = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
    if (mapped) {
      return toProviderAuthErrorResponse(mapped);
    }
  }

  if (isAppRouteError(error) && error.status === 400) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof ProviderApiError) {
    if (error.status === 404) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
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
    const { provider, providerId } = resolveMusicProviderFromRequest(_request);
    const { id } = await params;
    const playlistId = parsePlaylistId(id);
    assertPlaylistProviderCompat(playlistId, providerId);

    const playlistPermissions = await provider.getPlaylistPermissions(playlistId);

    const userResult = await fetchCurrentUserId(provider);
    if (userResult.error) {
      return userResult.error;
    }

    const isOwner = playlistPermissions.ownerId === userResult.userId;
    const isCollaborative = playlistPermissions.collaborative;
    const isEditable = isOwner || isCollaborative;

    return NextResponse.json({ isEditable });
  } catch (error) {
    return mapPermissionsError(error, _request);
  }
}
