import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { isAppRouteError } from '@/lib/errors';
import { ProviderApiError } from '@/lib/music-provider/types';

/**
 * GET /api/albums/[albumId]/tracks?provider=spotify|tidal
 *
 * Get tracks for an album.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> },
) {
  try {
    await assertAuthenticated();

    const { albumId } = await params;
    if (!albumId) {
      return NextResponse.json({ error: 'Missing albumId' }, { status: 400 });
    }

    const { provider } = resolveMusicProviderFromRequest(request);
    const tracks = await provider.getAlbumTracks(albumId);
    return NextResponse.json({ tracks });
  } catch (error: unknown) {
    const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
    if (authError) {
      return toProviderAuthErrorResponse(authError);
    }

    if (isAppRouteError(error) && error.status === 401) {
      const mapped = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
      if (mapped) {
        return toProviderAuthErrorResponse(mapped);
      }
    }

    if (error instanceof ProviderApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
