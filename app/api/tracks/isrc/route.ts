import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { isAppRouteError } from '@/lib/errors';
import { ProviderApiError } from '@/lib/music-provider/types';

const querySchema = z.object({
  isrc: z.string().min(1).max(20),
});

/**
 * GET /api/tracks/isrc?isrc=USRC12345678&provider=spotify|tidal
 *
 * Look up a track by ISRC through the selected music provider.
 * Returns { track: Track | null }.
 */
export async function GET(request: NextRequest) {
  try {
    await assertAuthenticated();

    const { isrc } = querySchema.parse({
      isrc: request.nextUrl.searchParams.get('isrc') ?? undefined,
    });

    const { provider } = resolveMusicProviderFromRequest(request);

    if (!provider.getTrackByIsrc) {
      return NextResponse.json({ track: null });
    }

    const track = await provider.getTrackByIsrc(isrc);
    return NextResponse.json({ track });
  } catch (error: unknown) {
    const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
    if (authError) return toProviderAuthErrorResponse(authError);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid query params' }, { status: 400 });
    }

    if (isAppRouteError(error) && error.status === 401) {
      const mapped = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
      if (mapped) return toProviderAuthErrorResponse(mapped);
    }

    if (error instanceof ProviderApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
