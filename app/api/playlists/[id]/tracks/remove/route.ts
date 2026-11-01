import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { noteSmartSyncPlaylistEdited } from '@/lib/sync/syncSchedule';
import { logTrackRemove } from '@/lib/metrics/api-helpers';
import { ProviderApiError, type MusicProvider } from '@/lib/music-provider/types';
import { ProviderAuthError } from '@/lib/providers/errors';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';

type RemovableTrack = { uri: string; positions?: number[] };

function isTokenExpiredSession(session: unknown): boolean {
  if (!session) {
    return true;
  }

  return false;
}

function mapTrackRemoveThrownError(error: unknown): NextResponse {
  const authError = mapApiErrorToProviderAuthError(error);
  if (authError) {
    return toProviderAuthErrorResponse(authError);
  }

  if (error instanceof ProviderApiError) {
    let errorMessage = error.message;
    if (error.status === 403) {
      errorMessage = "You don't have permission to modify this playlist.";
    } else if (error.status === 404) {
      errorMessage = 'Playlist not found.';
    }

    return NextResponse.json({ error: errorMessage, details: error.details }, { status: error.status });
  }

  console.error('[api/playlists/tracks/remove] Error:', error);

  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Internal server error' },
    { status: 500 }
  );
}

function isValidTrackUri(uri: unknown): boolean {
  return typeof uri === 'string' && uri.length > 0;
}

function parseTracksToRemove(body: any): RemovableTrack[] | NextResponse {
  const { tracks, trackUris } = body;

  if (Array.isArray(tracks) && tracks.length > 0) {
    if (!tracks.every((t: any) => isValidTrackUri(t.uri))) {
      return NextResponse.json({ error: 'All track URIs must be non-empty strings' }, { status: 400 });
    }

    return tracks;
  }

  if (Array.isArray(trackUris) && trackUris.length > 0) {
    if (!trackUris.every((uri: unknown) => isValidTrackUri(uri))) {
      return NextResponse.json({ error: 'All track URIs must be non-empty strings' }, { status: 400 });
    }

    return trackUris.map((uri: string) => ({ uri }));
  }

  return NextResponse.json({ error: 'tracks or trackUris must be a non-empty array' }, { status: 400 });
}

/**
 * DELETE /api/playlists/[id]/tracks/remove
 *
 * Removes tracks from a playlist.
 * 
 * When `positions` are given, only those entries are removed (duplicates elsewhere are
 * kept). Returns 409 if the playlist no longer matches the given positions.
 *
 * Body: { tracks: Array<{ uri: string, positions?: number[] }>, snapshotId?: string }
 * Returns: { snapshotId: string } on success
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (isTokenExpiredSession(session)) {
      return toProviderAuthErrorResponse(
        new ProviderAuthError(getMusicProviderHintFromRequest(request), 'unauthenticated', 'Authentication required'),
      );
    }

    const { id: playlistId } = await params;

    if (!playlistId || typeof playlistId !== 'string') {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const tracksToRemove = parseTracksToRemove(body);
    if (tracksToRemove instanceof NextResponse) {
      return tracksToRemove;
    }

    const { providerId, provider } = resolveMusicProviderFromRequest(request);

    // Check if we need position-based removal (for duplicates)
    const hasPositions = tracksToRemove.some((t: RemovableTrack) => t.positions && t.positions.length > 0);

    const response = hasPositions
      // Use rebuild approach for position-based removal
      ? await handlePositionBasedRemoval(provider, playlistId, tracksToRemove)
      // Use simple DELETE for non-duplicate removal
      : await handleSimpleRemoval(provider, playlistId, tracksToRemove);
    if (response.ok) noteSmartSyncPlaylistEdited(providerId, playlistId);
    return response;
  } catch (error) {
    const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
    if (authError) {
      return toProviderAuthErrorResponse(authError);
    }

    return mapTrackRemoveThrownError(error);
  }
}

/**
 * Handle position-based removal. Providers remove exactly the requested entries and
 * leave every other entry (including other occurrences of the same track) untouched.
 */
async function handlePositionBasedRemoval(
  provider: MusicProvider,
  playlistId: string,
  tracksToRemove: RemovableTrack[]
): Promise<NextResponse> {
  const expected = tracksToRemove
    .filter((track): track is Required<RemovableTrack> => Array.isArray(track.positions) && track.positions.length > 0)
    .map((track) => ({ uri: track.uri, positions: track.positions }));

  const positionCount = expected.reduce((sum, track) => sum + track.positions.length, 0);
  if (positionCount === 0) {
    return NextResponse.json({ error: 'No positions specified for removal' }, { status: 400 });
  }

  const removed = await provider.removePlaylistTracksAtPositions(playlistId, expected);

  logTrackRemove(playlistId, positionCount).catch(() => {});

  return NextResponse.json({ snapshotId: removed.snapshotId });
}

/**
 * Handle simple removal (no positions) using standard DELETE.
 * This removes ALL instances of each URI, which is fine for non-duplicates.
 */
async function handleSimpleRemoval(
  provider: MusicProvider,
  playlistId: string,
  tracksToRemove: RemovableTrack[]
): Promise<NextResponse> {
  const uniqueUris = Array.from(new Set(tracksToRemove.map((track) => track.uri)));
  const removed = await provider.removePlaylistTracks(playlistId, uniqueUris);

  logTrackRemove(playlistId, tracksToRemove.length).catch(() => {});

  return NextResponse.json({ snapshotId: removed.snapshotId });
}
