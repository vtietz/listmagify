import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { spotifyFetch } from '@/lib/spotify/client';
import { logTrackRemove } from '@/lib/metrics/api-helpers';

/**
 * DELETE /api/playlists/[id]/tracks/remove
 *
 * Removes tracks from a playlist.
 * Used for move operations in the split grid.
 *
 * Body: { trackUris: string[], snapshotId?: string }
 * Returns: { snapshotId: string } on success
 */
export async function DELETE(
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

    const body = await request.json().catch(() => ({}));
    const { tracks, trackUris, snapshotId } = body;

    // Support both new format (tracks with positions) and legacy format (trackUris)
    let tracksToRemove: Array<{ uri: string; positions?: number[] }>;
    
    if (Array.isArray(tracks) && tracks.length > 0) {
      // New format: tracks array with optional positions
      tracksToRemove = tracks;
      
      if (!tracks.every((t: any) => typeof t.uri === 'string' && t.uri.startsWith('spotify:track:'))) {
        return NextResponse.json({ error: 'All track URIs must be valid Spotify URIs' }, { status: 400 });
      }
    } else if (Array.isArray(trackUris) && trackUris.length > 0) {
      // Legacy format: just URIs (removes all instances)
      if (!trackUris.every((uri: any) => typeof uri === 'string' && uri.startsWith('spotify:track:'))) {
        return NextResponse.json({ error: 'All track URIs must be valid Spotify URIs' }, { status: 400 });
      }
      tracksToRemove = trackUris.map((uri: string) => ({ uri }));
    } else {
      return NextResponse.json({ error: 'tracks or trackUris must be a non-empty array' }, { status: 400 });
    }

    // Spotify API: DELETE /playlists/{id}/tracks
    // https://developer.spotify.com/documentation/web-api/reference/remove-tracks-playlist
    // Maximum 100 items per request - batch if needed
    const BATCH_SIZE = 100;
    const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;

    let newSnapshotId: string | null = snapshotId ?? null;
    
    // Process in batches of 100 (Spotify API limit)
    // IMPORTANT: Process in reverse order when using positions to avoid index shifting
    // When removing items with positions, earlier removals shift indices of later items
    for (let i = 0; i < tracksToRemove.length; i += BATCH_SIZE) {
      const batch = tracksToRemove.slice(i, i + BATCH_SIZE);
      
      const requestBody: Record<string, unknown> = {
        tracks: batch,
      };

      // Use snapshot_id from previous batch for consistency
      if (newSnapshotId && typeof newSnapshotId === 'string') {
        requestBody.snapshot_id = newSnapshotId;
      }

      const res = await spotifyFetch(path, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[api/playlists/tracks/remove] DELETE ${path} failed: ${res.status} ${text}`);

        if (res.status === 401) {
          return NextResponse.json({ error: 'token_expired' }, { status: 401 });
        }

        let errorMessage = `Failed to remove tracks: ${res.status} ${res.statusText}`;

        if (res.status === 400) {
          errorMessage = 'Invalid request. Check that all track URIs are valid.';
        } else if (res.status === 403) {
          errorMessage = "You don't have permission to modify this playlist.";
        } else if (res.status === 404) {
          errorMessage = 'Playlist not found.';
        }

        // Include batch info in error for debugging
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(tracksToRemove.length / BATCH_SIZE);
        return NextResponse.json(
          { error: `${errorMessage} (batch ${batchNum}/${totalBatches})`, details: text },
          { status: res.status }
        );
      }

      const result = await res.json();
      newSnapshotId = result?.snapshot_id ?? null;
    }

    if (!newSnapshotId) {
      console.warn('[api/playlists/tracks/remove] No snapshot_id in response');
      return NextResponse.json(
        { error: 'Remove succeeded but no snapshot_id returned' },
        { status: 500 }
      );
    }

    // Log metrics (fire-and-forget, non-blocking)
    logTrackRemove(playlistId, tracksToRemove.length).catch(() => {});

    return NextResponse.json({ snapshotId: newSnapshotId });
  } catch (error) {
    console.error('[api/playlists/tracks/remove] Error:', error);

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
