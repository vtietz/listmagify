import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
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
 * IMPORTANT: Provider APIs may not support position-based deletion directly.
 * The `positions` parameter is ignored - DELETE always removes ALL instances of a URI.
 * 
 * To handle duplicate tracks (same song at multiple positions), we use a "rebuild" approach:
 * 1. Fetch all current playlist tracks
 * 2. Filter out the specific positions we want to remove
 * 3. Replace the playlist contents with the filtered list
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

    const { provider } = resolveMusicProviderFromRequest(request);

    // Check if we need position-based removal (for duplicates)
    const hasPositions = tracksToRemove.some((t: RemovableTrack) => t.positions && t.positions.length > 0);
    
    if (hasPositions) {
      // Use rebuild approach for position-based removal
      return handlePositionBasedRemoval(provider, playlistId, tracksToRemove);
    } else {
      // Use simple DELETE for non-duplicate removal
      return handleSimpleRemoval(provider, playlistId, tracksToRemove);
    }
  } catch (error) {
    const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
    if (authError) {
      return toProviderAuthErrorResponse(authError);
    }

    return mapTrackRemoveThrownError(error);
  }
}

/**
 * Handle position-based removal using the "rebuild playlist" approach.
 * This is needed because provider delete operations may ignore positions.
 */
async function handlePositionBasedRemoval(
  provider: MusicProvider,
  playlistId: string,
  tracksToRemove: RemovableTrack[]
): Promise<NextResponse> {
  // Build set of positions to remove
  const positionsToRemove = new Set<number>();
  tracksToRemove.forEach(t => {
    if (t.positions) {
      t.positions.forEach(pos => positionsToRemove.add(pos));
    }
  });

  if (positionsToRemove.size === 0) {
    return NextResponse.json({ error: 'No positions specified for removal' }, { status: 400 });
  }

  console.debug('[api/playlists/tracks/remove] Position-based removal, positions:', Array.from(positionsToRemove));

  // Fetch all current playlist tracks
  const allTracks = await fetchAllPlaylistTracks(provider, playlistId);
  
  if (!allTracks) {
    return NextResponse.json({ error: 'Failed to fetch playlist tracks' }, { status: 500 });
  }

  console.debug(`[api/playlists/tracks/remove] Fetched ${allTracks.length} tracks from playlist`);

  // Filter out the positions we want to remove
  const remainingTracks = allTracks.filter((_, index) => !positionsToRemove.has(index));
  
  console.debug(`[api/playlists/tracks/remove] After removal: ${remainingTracks.length} tracks remain`);

  // Replace playlist contents
  const newSnapshotId = await replacePlaylistTracks(provider, playlistId, remainingTracks);
  
  if (!newSnapshotId) {
    return NextResponse.json({ error: 'Failed to update playlist' }, { status: 500 });
  }

  // Log metrics
  logTrackRemove(playlistId, positionsToRemove.size).catch(() => {});

  return NextResponse.json({ snapshotId: newSnapshotId });
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

/**
 * Fetch all tracks from a playlist (handles pagination).
 */
async function fetchAllPlaylistTracks(provider: MusicProvider, playlistId: string): Promise<string[] | null> {
  try {
    return await provider.getPlaylistTrackUris(playlistId);
  } catch (error) {
    console.error('[fetchAllPlaylistTracks] Error:', error);
    return null;
  }
}

/**
 * Replace all tracks in a playlist with a new list.
 * Uses PUT for small playlists, or clear+add for larger ones.
 */
async function replacePlaylistTracks(provider: MusicProvider, playlistId: string, trackUris: string[]): Promise<string | null> {
  try {
    const replaced = await provider.replacePlaylistTracks(playlistId, trackUris);
    return replaced.snapshotId;
  } catch (error) {
    console.error('[replacePlaylistTracks] Error:', error);
    return null;
  }
}
