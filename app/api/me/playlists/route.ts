import { NextRequest, NextResponse } from "next/server";
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { isAppRouteError } from '@/lib/errors';
import { ProviderApiError } from '@/lib/music-provider/types';

/**
 * GET /api/me/playlists
 * 
 * Returns the current user's playlists with pagination support.
 * Accepts optional nextCursor query parameter for infinite scroll.
 * Uses server-side provider access token (never exposes tokens to client).
 * 
 * Query params:
 * - nextCursor (optional): Provider cursor URL for the next page
 */
export async function GET(request: NextRequest) {
  try {
    await assertAuthenticated();

    const searchParams = request.nextUrl.searchParams;
    const nextCursor = searchParams.get("nextCursor");
    const { provider } = resolveMusicProviderFromRequest(request);
    const result = await provider.getUserPlaylists(50, nextCursor);

    return NextResponse.json({
      items: result.items,
      nextCursor: result.nextCursor,
      total: result.total,
    });
  } catch (error) {
    const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
    if (authError) {
      return toProviderAuthErrorResponse(authError);
    }

    if (error instanceof ProviderApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    if (isAppRouteError(error) && error.status === 401) {
      const mapped = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
      if (mapped) {
        return toProviderAuthErrorResponse(mapped);
      }
    }

    console.error("[api/me/playlists] Error:", error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
