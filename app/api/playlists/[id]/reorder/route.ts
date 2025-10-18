import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { spotifyFetch } from "@/lib/spotify/client";

/**
 * PUT /api/playlists/[id]/reorder
 * 
 * Reorders tracks in a playlist using Spotify's reorder endpoint.
 * Supports optimistic concurrency via snapshot_id.
 * 
 * Body: { fromIndex: number, toIndex: number, rangeLength?: number, snapshotId?: string }
 * Returns: { snapshotId: string } on success
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: playlistId } = await params;

    if (!playlistId || typeof playlistId !== "string") {
      return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { fromIndex, toIndex, rangeLength = 1, snapshotId } = body;

    // Validate required fields
    if (
      typeof fromIndex !== "number" ||
      typeof toIndex !== "number" ||
      fromIndex < 0 ||
      toIndex < 0
    ) {
      return NextResponse.json(
        { error: "Invalid fromIndex or toIndex" },
        { status: 400 }
      );
    }

    if (typeof rangeLength !== "number" || rangeLength < 1) {
      return NextResponse.json(
        { error: "Invalid rangeLength (must be >= 1)" },
        { status: 400 }
      );
    }

    // Spotify API: PUT /playlists/{id}/tracks with reorder params
    // https://developer.spotify.com/documentation/web-api/reference/reorder-or-replace-playlists-tracks
    const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;
    
    const requestBody: Record<string, any> = {
      range_start: fromIndex,
      insert_before: toIndex,
      range_length: rangeLength,
    };

    // Include snapshot_id for optimistic concurrency if provided
    if (snapshotId && typeof snapshotId === "string") {
      requestBody.snapshot_id = snapshotId;
    }

    const res = await spotifyFetch(path, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[api/playlists/reorder] PUT ${path} failed: ${res.status} ${text}`);
      
      // Provide actionable error messages
      let errorMessage = `Failed to reorder tracks: ${res.status} ${res.statusText}`;
      
      if (res.status === 400) {
        errorMessage = "Invalid reorder request. The playlist may have been modified by another client.";
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
      console.warn("[api/playlists/reorder] No snapshot_id in response");
      return NextResponse.json(
        { error: "Reorder succeeded but no snapshot_id returned" },
        { status: 500 }
      );
    }

    return NextResponse.json({ snapshotId: newSnapshotId });
  } catch (error) {
    console.error("[api/playlists/reorder] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
