import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { spotifyFetch } from "@/lib/spotify/client";
import { logTrackReorder } from '@/lib/metrics/api-helpers';

type ReorderRequestData = {
  playlistId: string;
  fromIndex: number;
  toIndex: number;
  rangeLength: number;
  snapshotId?: string;
};

async function ensureReorderSession(): Promise<true | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session || (session as any).error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "token_expired" }, { status: 401 });
  }

  return true;
}

async function parseReorderRequest(
  request: NextRequest,
  params: Promise<{ id: string }>
): Promise<ReorderRequestData | NextResponse> {
  const { id: playlistId } = await params;
  if (!playlistId || typeof playlistId !== "string") {
    return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { fromIndex, toIndex, rangeLength = 1, snapshotId } = body;

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

  return {
    playlistId,
    fromIndex,
    toIndex,
    rangeLength,
    ...(typeof snapshotId === "string" && snapshotId ? { snapshotId } : {}),
  };
}

function buildSpotifyReorderBody(input: ReorderRequestData): Record<string, any> {
  return {
    range_start: input.fromIndex,
    insert_before: input.toIndex,
    range_length: input.rangeLength,
    ...(input.snapshotId ? { snapshot_id: input.snapshotId } : {}),
  };
}

function mapSpotifyReorderError(res: Response, text: string): NextResponse {
  if (res.status === 401) {
    return NextResponse.json({ error: "token_expired" }, { status: 401 });
  }

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

function mapReorderThrownError(error: unknown): NextResponse {
  console.error("[api/playlists/reorder] Error:", error);

  const errorMessage = error instanceof Error ? error.message : String(error);
  if (errorMessage.includes("401") || errorMessage.includes("Unauthorized") || errorMessage.includes("access token expired")) {
    return NextResponse.json({ error: "token_expired" }, { status: 401 });
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Internal server error" },
    { status: 500 }
  );
}

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
    const authResult = await ensureReorderSession();
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const parsedRequest = await parseReorderRequest(request, params);
    if (parsedRequest instanceof NextResponse) {
      return parsedRequest;
    }

    const path = `/playlists/${encodeURIComponent(parsedRequest.playlistId)}/tracks`;
    const requestBody = buildSpotifyReorderBody(parsedRequest);

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
      return mapSpotifyReorderError(res, text);
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

    // Log metrics (fire-and-forget, non-blocking)
    logTrackReorder(parsedRequest.playlistId, parsedRequest.rangeLength).catch(() => {});

    return NextResponse.json({ snapshotId: newSnapshotId });
  } catch (error) {
    return mapReorderThrownError(error);
  }
}
