import { NextRequest, NextResponse } from "next/server";
import { requireAuth, ServerAuthError } from "@/lib/auth/requireAuth";
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { ProviderApiError } from '@/lib/music-provider/types';

type ReorderAllInput = {
  playlistId: string;
  trackUris: string[];
};


async function parseReorderAllInput(
  request: NextRequest,
  params: Promise<{ id: string }>
): Promise<ReorderAllInput | NextResponse> {
  const { id: playlistId } = await params;

  if (!playlistId || typeof playlistId !== "string") {
    return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { trackUris } = body;

  if (!Array.isArray(trackUris) || trackUris.length === 0) {
    return NextResponse.json(
      { error: "trackUris must be a non-empty array" },
      { status: 400 }
    );
  }

  if (!trackUris.every((uri: unknown) => typeof uri === "string" && uri.length > 0)) {
    const invalidUris = trackUris.filter((uri: unknown) => typeof uri !== "string" || uri.length === 0);
    console.error(`[api/playlists/reorder-all] Invalid URIs found:`, invalidUris.slice(0, 10));
    return NextResponse.json(
      {
        error: "All trackUris must be non-empty strings",
        details: `Found ${invalidUris.length} invalid URI(s).`
      },
      { status: 400 }
    );
  }

  const uniqueUris = new Set(trackUris);
  if (uniqueUris.size !== trackUris.length) {
    console.warn(
      `[api/playlists/reorder-all] Duplicate URIs detected in request. ` +
      `${trackUris.length} URIs provided, ${uniqueUris.size} unique. This is normal for playlists with duplicate tracks.`
    );
  }

  return { playlistId, trackUris };
}

function mapReorderAllThrownError(error: unknown): NextResponse {
  if (error instanceof ServerAuthError) {
    return NextResponse.json({ error: "token_expired" }, { status: 401 });
  }

  if (error instanceof ProviderApiError) {
    if (error.status === 401) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    let errorMessage = error.message;
    if (error.status === 400) {
      errorMessage = 'Invalid request. Some tracks may not be available in this provider catalog.';
    } else if (error.status === 403) {
      errorMessage = "You don't have permission to modify this playlist.";
    } else if (error.status === 404) {
      errorMessage = 'Playlist not found.';
    }

    return NextResponse.json({ error: errorMessage, details: error.details }, { status: error.status });
  }

  console.error("[api/playlists/reorder-all] Error:", error);

  const errorMessage = error instanceof Error ? error.message : String(error);
  if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
    return NextResponse.json({ error: "token_expired" }, { status: 401 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}

/**
 * PUT /api/playlists/[id]/reorder-all
 * 
 * Reorders all tracks in a playlist to match the provided order.
 * This replaces the entire playlist track order with the new URIs order.
 * 
 * For playlists with >100 tracks, uses batch operations:
 * 1. Clears playlist (PUT with empty array)
 * 2. Adds tracks back in batches of 100 (POST)
 * 
 * Body: { trackUris: string[] }
 * Returns: { snapshotId: string } on success
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { provider } = resolveMusicProviderFromRequest(request);

    const parsedInput = await parseReorderAllInput(request, params);
    if (parsedInput instanceof NextResponse) {
      return parsedInput;
    }

    const { playlistId, trackUris } = parsedInput;
    const reordered = await provider.replacePlaylistTracks(playlistId, trackUris);
    return NextResponse.json({ snapshotId: reordered.snapshotId });
  } catch (error) {
    return mapReorderAllThrownError(error);
  }
}
