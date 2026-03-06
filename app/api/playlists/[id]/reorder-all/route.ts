import { NextRequest, NextResponse } from "next/server";
import { requireAuth, ServerAuthError } from "@/lib/auth/requireAuth";
import { spotifyFetchWithToken } from "@/lib/spotify/client";

type ReorderAllInput = {
  playlistId: string;
  trackUris: string[];
};

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
    void await clearRes.text().catch(() => "");
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
      void await addRes.text().catch(() => "");
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

async function parseReorderAllInput(
  request: NextRequest,
  params: Promise<{ id: string }>
): Promise<ReorderAllInput | NextResponse> {
  const { id: playlistId } = await params;

  if (!playlistId || typeof playlistId !== "string") {
    return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { trackUris } = body;

  if (!Array.isArray(trackUris) || trackUris.length === 0) {
    return NextResponse.json(
      { error: "trackUris must be a non-empty array" },
      { status: 400 }
    );
  }

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

  const uniqueUris = new Set(trackUris);
  if (uniqueUris.size !== trackUris.length) {
    console.warn(
      `[api/playlists/reorder-all] Duplicate URIs detected in request. ` +
      `${trackUris.length} URIs provided, ${uniqueUris.size} unique. This is normal for playlists with duplicate tracks.`
    );
  }

  return { playlistId, trackUris };
}

async function executeSimpleReorder(
  accessToken: string,
  path: string,
  trackUris: string[]
): Promise<string | NextResponse> {
  const res = await spotifyFetchWithToken(accessToken, path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris: trackUris }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return handleSpotifyError(res, text, trackUris.length);
  }

  const result = await res.json();
  return result?.snapshot_id ?? "";
}

async function executeReorderAll(
  accessToken: string,
  path: string,
  trackUris: string[]
): Promise<string | NextResponse> {
  if (trackUris.length <= 100) {
    return executeSimpleReorder(accessToken, path, trackUris);
  }

  try {
    return (await processBatchedReorder(accessToken, path, trackUris)) ?? "";
  } catch (batchError) {
    return NextResponse.json(
      { error: batchError instanceof Error ? batchError.message : "Failed to reorder playlist" },
      { status: 500 }
    );
  }
}

function mapReorderAllThrownError(error: unknown): NextResponse {
  if (error instanceof ServerAuthError) {
    return NextResponse.json({ error: "token_expired" }, { status: 401 });
  }

  console.error("[api/playlists/reorder-all] Error:", error);

  const errorMessage = error instanceof Error ? error.message : String(error);
  if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
    return NextResponse.json({ error: "token_expired" }, { status: 401 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
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

    const parsedInput = await parseReorderAllInput(request, params);
    if (parsedInput instanceof NextResponse) {
      return parsedInput;
    }

    const { playlistId, trackUris } = parsedInput;
    const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;
    const result = await executeReorderAll(session.accessToken, path, trackUris);
    if (result instanceof NextResponse) {
      return result;
    }

    if (!result) {
      console.warn("[api/playlists/reorder-all] No snapshot_id in response");
      return NextResponse.json(
        { error: "Reorder succeeded but no snapshot_id returned" },
        { status: 500 }
      );
    }

    return NextResponse.json({ snapshotId: result });
  } catch (error) {
    return mapReorderAllThrownError(error);
  }
}
