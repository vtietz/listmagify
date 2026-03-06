import { NextRequest, NextResponse } from "next/server";
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { isAppRouteError } from '@/lib/errors';
import { spotifyFetch } from "@/lib/spotify/client";
import { mapPlaylistItemToTrack, type Track } from "@/lib/spotify/types";
import { parsePlaylistId } from '@/lib/services/spotifyPlaylistService';

const TRACK_FIELDS = "items(track(id,uri,name,artists(name),duration_ms,album(id,name,images,release_date,release_date_precision),popularity),added_at,added_by(id,display_name)),next,total,snapshot_id";

function buildTracksPath(playlistId: string, nextCursorParam: string | null): string {
  if (!nextCursorParam) {
    return `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100&fields=${encodeURIComponent(TRACK_FIELDS)}`;
  }

  try {
    const url = new URL(nextCursorParam);
    const offset = url.searchParams.get('offset') || '0';
    const limit = url.searchParams.get('limit') || '100';
    return `/playlists/${encodeURIComponent(playlistId)}/tracks?offset=${offset}&limit=${limit}&fields=${encodeURIComponent(TRACK_FIELDS)}`;
  } catch {
    return nextCursorParam.includes('fields=')
      ? nextCursorParam
      : `${nextCursorParam}&fields=${encodeURIComponent(TRACK_FIELDS)}`;
  }
}

function extractOffset(nextCursorParam: string | null, path: string): number {
  const url = new URL(nextCursorParam || `http://dummy${path}`);
  return parseInt(url.searchParams.get('offset') || '0', 10);
}

function mapTracksResponse(raw: any, offset: number) {
  const snapshotId = raw?.snapshot_id ?? null;
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];

  const tracks: Track[] = rawItems.map((item: unknown, index: number) => ({
    ...mapPlaylistItemToTrack(item),
    position: offset + index,
  }));

  const total = typeof raw?.total === "number" ? raw.total : tracks.length;
  const nextCursor = raw?.next ?? null;

  return {
    tracks,
    snapshotId,
    total,
    nextCursor,
  };
}

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
    await assertAuthenticated();
    const { id } = await params;
    const playlistId = parsePlaylistId(id);

    const searchParams = request.nextUrl.searchParams;
    const nextCursorParam = searchParams.get("nextCursor");

    const path = buildTracksPath(playlistId, nextCursorParam);
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
    return NextResponse.json(mapTracksResponse(raw, extractOffset(nextCursorParam, path)));
  } catch (error) {
    if (isAppRouteError(error) && error.status === 401) {
      return NextResponse.json({ error: "token_expired" }, { status: 401 });
    }

    if (isAppRouteError(error) && error.status === 400) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[api/playlists/tracks] Error:", error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
