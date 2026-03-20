import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { isAppRouteError } from '@/lib/errors';
import { ProviderApiError } from '@/lib/music-provider/types';

/**
 * GET /api/artists/[artistId]/tracks?provider=spotify|tidal
 *
 * Get top tracks for an artist.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artistId: string }> },
) {
  try {
    await assertAuthenticated();

    const { artistId } = await params;
    if (!artistId) {
      return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
    }

    const { provider } = resolveMusicProviderFromRequest(request);
    const tracks = await provider.getArtistTopTracks(artistId);
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
