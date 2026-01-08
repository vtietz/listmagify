import { NextRequest, NextResponse } from "next/server";
import { requireAuth, ServerAuthError } from "@/lib/auth/requireAuth";
import { spotifyFetchWithToken } from "@/lib/spotify/client";

/**
 * Helper function to process large playlists in batches
 */
async function processBatchedReorder(
  accessToken: string,
  path: string,
  trackUris: string[]
): Promise<string | null> {
  console.warn(`[api/playlists/reorder-all] Large playlist detected (${trackUris.length} tracks). Using batch operation.`);

  // Step 1: Clear the playlist
  const clearRes = await spotifyFetchWithToken(accessToken, path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris: [] }),
  });

  if (!clearRes.ok) {
    const text = await clearRes.text().catch(() => "");
    console.error(`[api/playlists/reorder-all] Failed to clear playlist: ${clearRes.status}`);
    throw new Error(`Failed to clear playlist: ${clearRes.status}`);
  }

  // Step 2: Add tracks back in batches of 100
  let newSnapshotId: string | null = null;
  
  for (let i = 0; i < trackUris.length; i += 100) {
    const batch = trackUris.slice(i, i + 100);
    
    const addRes = await spotifyFetchWithToken(accessToken, path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: batch }),
    });

    if (!addRes.ok) {
      const text = await addRes.text().catch(() => "");
      console.error(`[api/playlists/reorder-all] Failed to add batch ${i / 100 + 1}: ${addRes.status}`);
      throw new Error(`Failed to add batch ${i / 100 + 1}: ${addRes.status}`);
    }

    const result = await addRes.json();
    newSnapshotId = result?.snapshot_id ?? null;
  }

  return newSnapshotId;
}

/**
 * Helper function to handle Spotify API errors consistently
 */
function handleSpotifyError(res: Response, text: string, uriCount: number) {
  console.error(`[api/playlists/reorder-all] Spotify API error: ${res.status} ${text}`);
  
  // Forward 401 errors with consistent format
  if (res.status === 401) {
    return NextResponse.json({ error: "token_expired" }, { status: 401 });
  }
  
  // Provide actionable error messages
  let errorMessage = `Failed to reorder playlist: ${res.status} ${res.statusText}`;
  
  if (res.status === 400) {
    // Parse error response to get more details
    let errorDetails = text;
    try {
      const errorJson = JSON.parse(text);
      errorDetails = errorJson?.error?.message || errorJson?.message || text;
    } catch {
      // text is not JSON, use as-is
    }
    
    errorMessage = "Invalid request. Some tracks may not be available or have been removed from Spotify.";
    console.error(
      `[api/playlists/reorder-all] Spotify API returned 400. ` +
      `This usually means one or more tracks are unavailable, removed, or region-restricted. ` +
      `Track URIs in this batch: ${uriCount}. Details: ${errorDetails}`
    );
  } else if (res.status === 403) {
    errorMessage = "You don't have permission to modify this playlist.";
  } else if (res.status === 404) {
    errorMessage = "Playlist not found.";
  }

  return NextResponse.json(
    { error: errorMessage, details: text },
    { status: res.status }
  );
}

/**
 * PUT /api/playlists/[id]/reorder-all
 * 
 * Reorders all tracks in a playlist to match the provided order.
 * This replaces the entire playlist track order with the new URIs order.
 * 
 * For playlists with >100 tracks, uses batch operations:
 * 1. Clears playlist (PUT with empty array)
 * 2. Adds tracks back in batches of 100 (POST)
 * 
 * Body: { trackUris: string[] }
 * Returns: { snapshotId: string } on success
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();

    const { id: playlistId } = await params;

    if (!playlistId || typeof playlistId !== "string") {
      return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { trackUris } = body;

    // Validate required fields
    if (!Array.isArray(trackUris) || trackUris.length === 0) {
      return NextResponse.json(
        { error: "trackUris must be a non-empty array" },
        { status: 400 }
      );
    }

    // Validate all URIs
    if (!trackUris.every((uri: unknown) => typeof uri === "string" && uri.startsWith("spotify:track:"))) {
      const invalidUris = trackUris.filter((uri: unknown) => 
        typeof uri !== "string" || !uri.startsWith("spotify:track:")
      );
      console.error(`[api/playlists/reorder-all] Invalid URIs found:`, invalidUris.slice(0, 10));
      return NextResponse.json(
        { 
          error: "All trackUris must be valid Spotify track URIs starting with 'spotify:track:'",
          details: `Found ${invalidUris.length} invalid URI(s). Local files, episodes, and other non-Spotify tracks cannot be reordered.`
        },
        { status: 400 }
      );
    }

    // Additional validation: check for duplicate URIs that might cause issues
    const uniqueUris = new Set(trackUris);
    if (uniqueUris.size !== trackUris.length) {
      console.warn(
        `[api/playlists/reorder-all] Duplicate URIs detected in request. ` +
        `${trackUris.length} URIs provided, ${uniqueUris.size} unique. This is normal for playlists with duplicate tracks.`
      );
    }

    // Spotify API: PUT /playlists/{id}/tracks with uris array replaces all tracks
    // https://developer.spotify.com/documentation/web-api/reference/reorder-or-replace-playlists-tracks
    // Maximum 100 tracks per request
    const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;
    
    let newSnapshotId: string | null = null;

    // If 100 or fewer tracks, use simple PUT request
    if (trackUris.length <= 100) {
      const requestBody = {
        uris: trackUris,
      };

      const res = await spotifyFetchWithToken(session.accessToken, path, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return handleSpotifyError(res, text, trackUris.length);
      }

      const result = await res.json();
      newSnapshotId = result?.snapshot_id ?? null;
    } else {
      // For playlists with more than 100 tracks, use batch processing
      try {
        newSnapshotId = await processBatchedReorder(session.accessToken, path, trackUris);
      } catch (batchError) {
        // Error already logged in processBatchedReorder
        return NextResponse.json(
          { error: batchError instanceof Error ? batchError.message : "Failed to reorder playlist" },
          { status: 500 }
        );
      }
    }

    if (!newSnapshotId) {
      console.warn("[api/playlists/reorder-all] No snapshot_id in response");
      return NextResponse.json(
        { error: "Reorder succeeded but no snapshot_id returned" },
        { status: 500 }
      );
    }

    return NextResponse.json({ snapshotId: newSnapshotId });
  } catch (error) {
    // Handle auth errors consistently
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: "token_expired" }, { status: 401 });
    }

    console.error("[api/playlists/reorder-all] Error:", error);
    
    // Check if error is 401 Unauthorized
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
      return NextResponse.json({ error: "token_expired" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
