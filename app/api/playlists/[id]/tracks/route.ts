import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { spotifyFetch } from "@/lib/spotify/client";
import { mapPlaylistItemToTrack, type Track } from "@/lib/spotify/types";

/**
 * GET /api/playlists/[id]/tracks
 * 
 * Returns normalized tracks and the latest snapshot_id for optimistic concurrency.
 * Uses server-side Spotify access token (never exposes tokens to client).
 */
export async function GET(
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

    const searchParams = request.nextUrl.searchParams;
    const nextCursorParam = searchParams.get("nextCursor");

    let path: string;
    
    if (nextCursorParam) {
      // Use the full next URL provided by Spotify
      path = nextCursorParam;
    } else {
      // Fetch tracks from Spotify (limit 100 per request)
      const limit = 100;
      const fields = "items(track(id,uri,name,artists(name),duration_ms,album(id,name,images)),added_at),next,total,snapshot_id";
      path = `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}&fields=${encodeURIComponent(fields)}`;
    }

    const res = await spotifyFetch(path, { method: "GET" });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[api/playlists/tracks] GET ${path} failed: ${res.status} ${text}`);
      return NextResponse.json(
        { error: `Failed to fetch tracks: ${res.status} ${res.statusText}` },
        { status: res.status }
      );
    }

    const raw = await res.json();

    // Extract snapshot_id and normalize tracks
    const snapshotId = raw?.snapshot_id ?? null;
    const rawItems = Array.isArray(raw?.items) ? raw.items : [];
    const tracks: Track[] = rawItems.map(mapPlaylistItemToTrack);
    const total = typeof raw?.total === "number" ? raw.total : tracks.length;
    const nextCursor = raw?.next ?? null;

    return NextResponse.json({
      tracks,
      snapshotId,
      total,
      nextCursor,
    });
  } catch (error) {
    console.error("[api/playlists/tracks] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
