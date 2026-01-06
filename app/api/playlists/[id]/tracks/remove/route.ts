import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { spotifyFetch } from '@/lib/spotify/client';
import { logTrackRemove } from '@/lib/metrics/api-helpers';

/**
 * DELETE /api/playlists/[id]/tracks/remove
 *
 * Removes tracks from a playlist.
 * 
 * IMPORTANT: Spotify's API no longer supports position-based deletion.
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
    const { tracks, trackUris } = body;

    // Support both new format (tracks with positions) and legacy format (trackUris)
    let tracksToRemove: Array<{ uri: string; positions?: number[] }>;
    
    if (Array.isArray(tracks) && tracks.length > 0) {
      tracksToRemove = tracks;
      
      if (!tracks.every((t: any) => typeof t.uri === 'string' && t.uri.startsWith('spotify:track:'))) {
        return NextResponse.json({ error: 'All track URIs must be valid Spotify URIs' }, { status: 400 });
      }
    } else if (Array.isArray(trackUris) && trackUris.length > 0) {
      if (!trackUris.every((uri: any) => typeof uri === 'string' && uri.startsWith('spotify:track:'))) {
        return NextResponse.json({ error: 'All track URIs must be valid Spotify URIs' }, { status: 400 });
      }
      tracksToRemove = trackUris.map((uri: string) => ({ uri }));
    } else {
      return NextResponse.json({ error: 'tracks or trackUris must be a non-empty array' }, { status: 400 });
    }

    // Check if we need position-based removal (for duplicates)
    const hasPositions = tracksToRemove.some(t => t.positions && t.positions.length > 0);
    
    if (hasPositions) {
      // Use rebuild approach for position-based removal
      return await handlePositionBasedRemoval(playlistId, tracksToRemove);
    } else {
      // Use simple DELETE for non-duplicate removal
      return await handleSimpleRemoval(playlistId, tracksToRemove);
    }
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

/**
 * Handle position-based removal using the "rebuild playlist" approach.
 * This is needed because Spotify's API ignores the positions parameter.
 */
async function handlePositionBasedRemoval(
  playlistId: string,
  tracksToRemove: Array<{ uri: string; positions?: number[] }>
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

  console.log('[api/playlists/tracks/remove] Position-based removal, positions:', Array.from(positionsToRemove));

  // Fetch all current playlist tracks
  const allTracks = await fetchAllPlaylistTracks(playlistId);
  
  if (!allTracks) {
    return NextResponse.json({ error: 'Failed to fetch playlist tracks' }, { status: 500 });
  }

  console.log(`[api/playlists/tracks/remove] Fetched ${allTracks.length} tracks from playlist`);

  // Filter out the positions we want to remove
  const remainingTracks = allTracks.filter((_, index) => !positionsToRemove.has(index));
  
  console.log(`[api/playlists/tracks/remove] After removal: ${remainingTracks.length} tracks remain`);

  // Replace playlist contents
  const newSnapshotId = await replacePlaylistTracks(playlistId, remainingTracks);
  
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
  playlistId: string,
  tracksToRemove: Array<{ uri: string; positions?: number[] }>
): Promise<NextResponse> {
  const BATCH_SIZE = 100;
  const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;

  let newSnapshotId: string | null = null;
  
  for (let i = 0; i < tracksToRemove.length; i += BATCH_SIZE) {
    const batch = tracksToRemove.slice(i, i + BATCH_SIZE);
    
    // Only send URIs, not positions (they're ignored anyway)
    const requestBody = {
      tracks: batch.map(t => ({ uri: t.uri })),
    };

    const res = await spotifyFetch(path, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[api/playlists/tracks/remove] DELETE failed: ${res.status} ${text}`);

      if (res.status === 401) {
        return NextResponse.json({ error: 'token_expired' }, { status: 401 });
      }

      let errorMessage = `Failed to remove tracks: ${res.status} ${res.statusText}`;
      if (res.status === 403) {
        errorMessage = "You don't have permission to modify this playlist.";
      } else if (res.status === 404) {
        errorMessage = 'Playlist not found.';
      }

      return NextResponse.json({ error: errorMessage, details: text }, { status: res.status });
    }

    const result = await res.json();
    newSnapshotId = result?.snapshot_id ?? null;
  }

  if (!newSnapshotId) {
    return NextResponse.json({ error: 'Remove succeeded but no snapshot_id returned' }, { status: 500 });
  }

  logTrackRemove(playlistId, tracksToRemove.length).catch(() => {});

  return NextResponse.json({ snapshotId: newSnapshotId });
}

/**
 * Fetch all tracks from a playlist (handles pagination).
 */
async function fetchAllPlaylistTracks(playlistId: string): Promise<string[] | null> {
  const tracks: string[] = [];
  let offset = 0;
  const limit = 100;
  
  try {
    while (true) {
      const path = `/playlists/${encodeURIComponent(playlistId)}/tracks?offset=${offset}&limit=${limit}&fields=items(track(uri)),total`;
      const res = await spotifyFetch(path, { method: 'GET' });
      
      if (!res.ok) {
        console.error(`[fetchAllPlaylistTracks] GET failed: ${res.status}`);
        return null;
      }
      
      const data = await res.json();
      const items = data.items || [];
      
      for (const item of items) {
        if (item?.track?.uri) {
          tracks.push(item.track.uri);
        }
      }
      
      // Check if we've fetched all tracks
      if (items.length < limit || tracks.length >= (data.total || 0)) {
        break;
      }
      
      offset += limit;
    }
    
    return tracks;
  } catch (error) {
    console.error('[fetchAllPlaylistTracks] Error:', error);
    return null;
  }
}

/**
 * Replace all tracks in a playlist with a new list.
 * Uses PUT for small playlists, or clear+add for larger ones.
 */
async function replacePlaylistTracks(playlistId: string, trackUris: string[]): Promise<string | null> {
  const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;
  
  try {
    // Spotify's PUT endpoint can handle up to 100 URIs directly
    // For larger playlists, we need to clear first, then add in batches
    
    if (trackUris.length <= 100) {
      // Simple case: use PUT to replace all tracks
      const res = await spotifyFetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: trackUris }),
      });
      
      if (!res.ok) {
        console.error(`[replacePlaylistTracks] PUT failed: ${res.status}`);
        return null;
      }
      
      const data = await res.json();
      return data.snapshot_id || null;
    }
    
    // Large playlist: clear first, then add in batches
    // Step 1: Clear the playlist by setting to empty
    const clearRes = await spotifyFetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [] }),
    });
    
    if (!clearRes.ok) {
      console.error(`[replacePlaylistTracks] Clear failed: ${clearRes.status}`);
      return null;
    }
    
    // Step 2: Add tracks back in batches of 100
    let snapshotId: string | null = null;
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < trackUris.length; i += BATCH_SIZE) {
      const batch = trackUris.slice(i, i + BATCH_SIZE);
      
      const addRes = await spotifyFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: batch }),
      });
      
      if (!addRes.ok) {
        console.error(`[replacePlaylistTracks] Add batch failed: ${addRes.status}`);
        // Continue anyway - we don't want to leave playlist half-rebuilt
      }
      
      const addData = await addRes.json();
      snapshotId = addData.snapshot_id || snapshotId;
    }
    
    return snapshotId;
  } catch (error) {
    console.error('[replacePlaylistTracks] Error:', error);
    return null;
  }
}
