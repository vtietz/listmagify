import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { getJSON, spotifyFetch } from "@/lib/spotify/client";
import { pageFromSpotify, mapPlaylist } from "@/lib/spotify/types";

/**
 * GET /api/me/playlists
 * 
 * Returns the current user's playlists with pagination support.
 * Accepts optional nextCursor query parameter for infinite scroll.
 * Uses server-side Spotify access token (never exposes tokens to client).
 * 
 * Query params:
 * - nextCursor (optional): Full Spotify API URL to fetch next page
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const nextCursor = searchParams.get("nextCursor");

    let result;

    if (nextCursor) {
      // Use the full next URL provided by Spotify
      const res = await spotifyFetch(nextCursor, { method: "GET" });
      
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[api/me/playlists] GET ${nextCursor} failed: ${res.status} ${text}`);
        return NextResponse.json(
          { error: `Failed to fetch playlists: ${res.status} ${res.statusText}` },
          { status: res.status }
        );
      }

      const raw = await res.json();
      result = pageFromSpotify(raw, mapPlaylist);
    } else {
      // Initial request - start from the beginning with limit 50
      const limit = 50;
      const raw = await getJSON<any>(`/me/playlists?limit=${limit}`);
      result = pageFromSpotify(raw, mapPlaylist);
    }

    return NextResponse.json({
      items: result.items,
      nextCursor: result.nextCursor,
      total: result.total,
    });
  } catch (error) {
    console.error("[api/me/playlists] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
