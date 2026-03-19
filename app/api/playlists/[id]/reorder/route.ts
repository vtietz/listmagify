import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { logTrackReorder } from '@/lib/metrics/api-helpers';
import { ProviderApiError } from '@/lib/music-provider/types';

type ReorderRequestData = {
  playlistId: string;
  fromIndex: number;
  toIndex: number;
  rangeLength: number;
  snapshotId?: string;
};

async function ensureReorderSession(): Promise<true | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
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

function mapReorderThrownError(error: unknown): NextResponse {
  if (error instanceof ProviderApiError) {
    if (error.status === 401) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    let errorMessage = error.message;
    if (error.status === 400) {
      errorMessage = 'Invalid reorder request. The playlist may have been modified by another client.';
    } else if (error.status === 403) {
      errorMessage = "You don't have permission to modify this playlist.";
    } else if (error.status === 404) {
      errorMessage = 'Playlist not found.';
    }

    return NextResponse.json(
      { error: errorMessage, details: error.details },
      { status: error.status }
    );
  }

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
 * Reorders tracks in a playlist through the selected provider.
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

    const { provider } = resolveMusicProviderFromRequest(request);
    const reordered = await provider.reorderTracks({
      playlistId: parsedRequest.playlistId,
      fromIndex: parsedRequest.fromIndex,
      toIndex: parsedRequest.toIndex,
      rangeLength: parsedRequest.rangeLength,
      ...(parsedRequest.snapshotId ? { snapshotId: parsedRequest.snapshotId } : {}),
    });

    const newSnapshotId = reordered.snapshotId ?? null;

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
