import { NextRequest, NextResponse } from "next/server";
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { isAppRouteError } from '@/lib/errors';
import { getJSON, spotifyFetch } from "@/lib/spotify/client";
import { pageFromSpotify, mapPlaylist } from "@/lib/spotify/types";

type CursorFetchResult =
  | { ok: true; data: ReturnType<typeof pageFromSpotify> }
  | { ok: false; error: NextResponse };

async function fetchInitialPlaylists() {
  const raw = await getJSON<any>(`/me/playlists?limit=50`);
  return pageFromSpotify(raw, mapPlaylist);
}

async function fetchCursorPlaylists(nextCursor: string): Promise<CursorFetchResult> {
  const res = await spotifyFetch(nextCursor, { method: "GET" });

  if (!res.ok) {
    if (res.status === 401) {
      return { ok: false, error: NextResponse.json({ error: "token_expired" }, { status: 401 }) };
    }

    return {
      ok: false,
      error: NextResponse.json(
        { error: `Failed to fetch playlists: ${res.status} ${res.statusText}` },
        { status: res.status }
      ),
    };
  }

  const raw = await res.json();
  return { ok: true, data: pageFromSpotify(raw, mapPlaylist) };
}

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
    await assertAuthenticated();

    const searchParams = request.nextUrl.searchParams;
    const nextCursor = searchParams.get("nextCursor");

    const result: CursorFetchResult = nextCursor
      ? await fetchCursorPlaylists(nextCursor)
      : { ok: true, data: await fetchInitialPlaylists() };

    if (!result.ok) {
      return result.error;
    }

    return NextResponse.json({
      items: result.data.items,
      nextCursor: result.data.nextCursor,
      total: result.data.total,
    });
  } catch (error) {
    if (isAppRouteError(error) && error.status === 401) {
      return NextResponse.json({ error: "token_expired" }, { status: 401 });
    }

    console.error("[api/me/playlists] Error:", error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
