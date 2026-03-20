import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { ProviderApiError } from '@/lib/music-provider/types';

const querySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

function mapSearchError(error: unknown, request: NextRequest) {
  const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
  if (authError) return toProviderAuthErrorResponse(authError);
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid query params' }, { status: 400 });
  }
  if (error instanceof ProviderApiError) {
    return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

/**
 * GET /api/search/albums?q=query&limit=20&offset=0&provider=spotify|tidal
 */
export async function GET(request: NextRequest) {
  try {
    await assertAuthenticated();

    const { q, limit, offset } = querySchema.parse({
      q: request.nextUrl.searchParams.get('q') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? '20',
      offset: request.nextUrl.searchParams.get('offset') ?? '0',
    });
    const query = q?.trim() ?? '';

    if (query.length === 0) {
      return NextResponse.json({ albums: [], total: 0, nextOffset: null });
    }

    const { provider } = resolveMusicProviderFromRequest(request);
    return NextResponse.json(await provider.searchAlbums(query, limit, offset));
  } catch (error: unknown) {
    return mapSearchError(error, request);
  }
}
