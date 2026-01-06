import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ServerAuthError } from '@/lib/auth/requireAuth';
import { spotifyFetchWithToken } from '@/lib/spotify/client';
import { logTrackAdd } from '@/lib/metrics/api-helpers';

/**
 * POST /api/playlists/[id]/tracks/add
 *
 * Adds tracks to a playlist at a specific position.
 * Used for copy and move operations in the split grid.
 *
 * Body: { trackUris: string[], position?: number, snapshotId?: string }
 * Returns: { snapshotId: string } on success
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();

    const { id: playlistId } = await params;

    if (!playlistId || typeof playlistId !== 'string') {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { trackUris, position, snapshotId } = body;

    // Validate track URIs
    if (!Array.isArray(trackUris) || trackUris.length === 0) {
      return NextResponse.json({ error: 'trackUris must be a non-empty array' }, { status: 400 });
    }

    if (!trackUris.every((uri) => typeof uri === 'string' && uri.startsWith('spotify:track:'))) {
      return NextResponse.json({ error: 'All track URIs must be valid Spotify URIs' }, { status: 400 });
    }

    // Validate position if provided
    if (position !== undefined && (typeof position !== 'number' || position < 0)) {
      return NextResponse.json({ error: 'position must be a non-negative number' }, { status: 400 });
    }

    // Spotify API: POST /playlists/{id}/tracks
    // https://developer.spotify.com/documentation/web-api/reference/add-tracks-to-playlist
    // Maximum 100 items per request - batch if needed
    const BATCH_SIZE = 100;
    const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;
    
    let newSnapshotId: string | null = null;
    let currentPosition = position;
    
    // Process in batches of 100 (Spotify API limit)
    for (let i = 0; i < trackUris.length; i += BATCH_SIZE) {
      const batch = trackUris.slice(i, i + BATCH_SIZE);
      
      const requestBody: Record<string, unknown> = {
        uris: batch,
      };

      // For subsequent batches, adjust position to maintain order
      if (typeof currentPosition === 'number') {
        requestBody.position = currentPosition;
        currentPosition += batch.length;
      }

      // Use snapshot_id from previous batch for consistency (if available)
      if (newSnapshotId) {
        requestBody.snapshot_id = newSnapshotId;
      } else if (snapshotId && typeof snapshotId === 'string') {
        requestBody.snapshot_id = snapshotId;
      }

      const res = await spotifyFetchWithToken(session.accessToken, path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[api/playlists/tracks/add] POST ${path} failed: ${res.status} ${text}`);

        if (res.status === 401) {
          return NextResponse.json({ error: 'token_expired' }, { status: 401 });
        }

        let errorMessage = `Failed to add tracks: ${res.status} ${res.statusText}`;

        if (res.status === 400) {
          errorMessage = 'Invalid request. Check that all track URIs are valid.';
        } else if (res.status === 403) {
          errorMessage = "You don't have permission to modify this playlist.";
        } else if (res.status === 404) {
          errorMessage = 'Playlist not found.';
        }

        // Include batch info in error for debugging
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(trackUris.length / BATCH_SIZE);
        return NextResponse.json(
          { error: `${errorMessage} (batch ${batchNum}/${totalBatches})`, details: text },
          { status: res.status }
        );
      }

      const result = await res.json();
      newSnapshotId = result?.snapshot_id ?? null;
    }

    if (!newSnapshotId) {
      console.warn('[api/playlists/tracks/add] No snapshot_id in response');
      return NextResponse.json(
        { error: 'Add succeeded but no snapshot_id returned' },
        { status: 500 }
      );
    }

    // Log metrics (fire-and-forget, non-blocking)
    logTrackAdd(playlistId, trackUris.length).catch(() => {});

    return NextResponse.json({ snapshotId: newSnapshotId });
  } catch (error) {
    // Handle auth errors consistently
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    console.error('[api/playlists/tracks/add] Error:', error);

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
