import { NextRequest, NextResponse } from "next/server";
import { requireAuth, ServerAuthError } from "@/lib/auth/requireAuth";
import { spotifyFetchWithToken } from "@/lib/spotify/client";

/**
 * PUT /api/playlists/[id]/reorder-all
 * 
 * Reorders all tracks in a playlist to match the provided order.
 * This replaces the entire playlist track order with the new URIs order.
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
      console.error(`[api/playlists/reorder-all] Invalid URIs found:`, invalidUris.slice(0, 5));
      return NextResponse.json(
        { 
          error: "All trackUris must be valid Spotify track URIs starting with 'spotify:track:'",
          details: `Found ${invalidUris.length} invalid URI(s). Local files and other non-Spotify tracks cannot be reordered.`
        },
        { status: 400 }
      );
    }

    // Spotify API: PUT /playlists/{id}/tracks with uris array replaces all tracks
    // https://developer.spotify.com/documentation/web-api/reference/reorder-or-replace-playlists-tracks
    const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;
    
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
      console.error(`[api/playlists/reorder-all] PUT ${path} failed: ${res.status} ${text}`);
      
      // Forward 401 errors with consistent format
      if (res.status === 401) {
        return NextResponse.json({ error: "token_expired" }, { status: 401 });
      }
      
      // Provide actionable error messages
      let errorMessage = `Failed to reorder playlist: ${res.status} ${res.statusText}`;
      
      if (res.status === 400) {
        errorMessage = "Invalid request. Some tracks may not be available.";
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

    const result = await res.json();

    // Extract new snapshot_id from response
    const newSnapshotId = result?.snapshot_id ?? null;

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
