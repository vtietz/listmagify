import { NextRequest, NextResponse } from "next/server";
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { assertPlaylistProviderCompat, getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { isAppRouteError } from '@/lib/errors';
import { ProviderApiError } from '@/lib/music-provider/types';
import { parsePlaylistId } from '@/lib/services/playlistService';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';

/**
 * GET /api/playlists/[id]/tracks
 * 
 * Returns normalized tracks and the latest snapshot_id for optimistic concurrency.
 * Uses server-side provider access token (never exposes tokens to client).
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

    const { provider, providerId } = resolveMusicProviderFromRequest(request);
    assertPlaylistProviderCompat(playlistId, providerId);
    const result = await provider.getPlaylistTracks(playlistId, 100, nextCursorParam);
    return NextResponse.json(result);
  } catch (error) {
    const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
    if (authError) {
      return toProviderAuthErrorResponse(authError);
    }

    if (error instanceof ProviderApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (isAppRouteError(error) && error.status === 401) {
      const mapped = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
      if (mapped) {
        return toProviderAuthErrorResponse(mapped);
      }
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
