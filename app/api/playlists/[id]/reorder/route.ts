import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { logTrackReorder } from '@/lib/metrics/api-helpers';
import { ProviderApiError } from '@/lib/music-provider/types';
import { ProviderAuthError } from '@/lib/providers/errors';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';

type ReorderRequestData = {
  playlistId: string;
  fromIndex: number;
  toIndex: number;
  rangeLength: number;
  snapshotId?: string;
};

async function ensureReorderSession(providerHint: 'spotify' | 'tidal'): Promise<true | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return toProviderAuthErrorResponse(
      new ProviderAuthError(providerHint, 'unauthenticated', 'Authentication required'),
    );
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
  const authError = mapApiErrorToProviderAuthError(error);
  if (authError) {
    return toProviderAuthErrorResponse(authError);
  }

  if (error instanceof ProviderApiError) {
    const errorMessage = mapProviderReorderErrorMessage(error);

    return NextResponse.json(
      { error: errorMessage, details: error.details },
      { status: error.status }
    );
  }

  console.error("[api/playlists/reorder] Error:", error);

  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Internal server error" },
    { status: 500 }
  );
}

function mapTidalReorderBadRequestMessage(error: ProviderApiError): string {
  if (/invalid indexes/i.test(error.message)) {
    return 'Invalid reorder position.';
  }

  if (typeof error.details === 'string' && error.details.trim().length > 0) {
    const detail = error.details.trim();
    if (/positionbefore/i.test(detail)) {
      return 'Unable to reorder tracks on TIDAL: invalid target position.';
    }

    if (/itemid/i.test(detail)) {
      return 'Unable to reorder tracks on TIDAL: invalid source track reference.';
    }

    return `Unable to reorder tracks on TIDAL: ${detail}`;
  }

  return 'Unable to reorder tracks on TIDAL. Please refresh the playlist and try again.';
}

function mapProviderReorderErrorMessage(error: ProviderApiError): string {
  if (error.status === 400) {
    if (error.provider === 'spotify') {
      return 'Invalid reorder request. The playlist may have been modified by another client.';
    }

    if (error.provider === 'tidal') {
      return mapTidalReorderBadRequestMessage(error);
    }
  }

  if (error.status === 403) {
    return "You don't have permission to modify this playlist.";
  }

  if (error.status === 404) {
    return 'Playlist not found.';
  }

  return error.message;
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
    const providerHint = getMusicProviderHintFromRequest(request);
    const authResult = await ensureReorderSession(providerHint);
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
