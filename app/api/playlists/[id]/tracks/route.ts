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
      return NextResponse.json({ error: "token_expired" }, { status: 401 });
    }

    // Check if there's a session error (refresh failed)
    if ((session as any).error === "RefreshAccessTokenError") {
      return NextResponse.json({ error: "token_expired" }, { status: 401 });
    }

    const { id: playlistId } = await params;

    if (!playlistId || typeof playlistId !== "string") {
      return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const nextCursorParam = searchParams.get("nextCursor");

    console.log("[api/playlists/tracks] nextCursorParam:", nextCursorParam);

    // Fields parameter for consistent data fetching (includes added_by for collaborative playlists)
    const fields = "items(track(id,uri,name,artists(name),duration_ms,album(id,name,images,release_date,release_date_precision),popularity),added_at,added_by(id,display_name)),next,total,snapshot_id";

    let path: string;
    
    if (nextCursorParam) {
      // nextCursor is a full Spotify URL like:
      // https://api.spotify.com/v1/playlists/xxx/tracks?offset=100&limit=100
      // Extract just the path part and ensure our fields parameter is used
      try {
        const url = new URL(nextCursorParam);
        const offset = url.searchParams.get('offset') || '0';
        const limit = url.searchParams.get('limit') || '100';
        // Rebuild with our fields to ensure added_by is included
        path = `/playlists/${encodeURIComponent(playlistId)}/tracks?offset=${offset}&limit=${limit}&fields=${encodeURIComponent(fields)}`;
        console.log("[api/playlists/tracks] Parsed cursor to path with fields:", path);
      } catch (err) {
        // If not a full URL, assume it's already a path but add fields
        console.log("[api/playlists/tracks] Not a URL, using as-is with fields");
        path = nextCursorParam.includes('fields=') 
          ? nextCursorParam 
          : `${nextCursorParam}&fields=${encodeURIComponent(fields)}`;
      }
    } else {
      // Fetch tracks from Spotify (limit 100 per request)
      const limit = 100;
      path = `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}&fields=${encodeURIComponent(fields)}`;
    }

    console.log("[api/playlists/tracks] Final path:", path);
    const res = await spotifyFetch(path, { method: "GET" });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[api/playlists/tracks] GET ${path} failed: ${res.status} ${text}`);
      
      // Forward 401 errors with consistent format
      if (res.status === 401) {
        return NextResponse.json({ error: "token_expired" }, { status: 401 });
      }
      
      return NextResponse.json(
        { error: `Failed to fetch tracks: ${res.status} ${res.statusText}` },
        { status: res.status }
      );
    }

    const raw = await res.json();

    // Extract snapshot_id and normalize tracks
    const snapshotId = raw?.snapshot_id ?? null;
    const rawItems = Array.isArray(raw?.items) ? raw.items : [];
    
    // Calculate the starting offset for this page
    const url = new URL(nextCursorParam || `http://dummy${path}`);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    
    // Map tracks with their original positions
    const tracks: Track[] = rawItems.map((item: unknown, index: number) => ({
      ...mapPlaylistItemToTrack(item),
      position: offset + index,
    }));
    
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
    
    // Check if error is 401 Unauthorized
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized") || errorMessage.includes("access token expired")) {
      return NextResponse.json({ error: "token_expired" }, { status: 401 });
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
