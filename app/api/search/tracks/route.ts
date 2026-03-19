import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { isAppRouteError } from '@/lib/errors';
import { ProviderApiError } from '@/lib/music-provider/types';

const querySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function parseSearchQuery(searchParams: URLSearchParams) {
  return querySchema.parse({
    q: searchParams.get('q') ?? undefined,
    limit: searchParams.get('limit') ?? '50',
    offset: searchParams.get('offset') ?? '0',
  });
}

function emptyTracksResponse() {
  return NextResponse.json({
    tracks: [],
    total: 0,
    nextOffset: null,
  });
}

async function executeTrackSearch(request: NextRequest, query: string, limit: number, offset: number) {
  const { provider } = resolveMusicProviderFromRequest(request);
  return provider.searchTracks(query, limit, offset);
}

async function mapSearchError(error: any, request: NextRequest) {
  const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
  if (authError) {
    return toProviderAuthErrorResponse(authError);
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid query params' }, { status: 400 });
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

/**
 * GET /api/search/tracks?q=query&limit=50&offset=0
 * 
 * Search for tracks through the selected music provider.
 * Returns normalized tracks matching the search query.
 */
export async function GET(request: NextRequest) {
  try {
    await assertAuthenticated();

    const { q, limit, offset } = parseSearchQuery(request.nextUrl.searchParams);
    const query = q?.trim() ?? '';

    if (query.length === 0) {
      return emptyTracksResponse();
    }

    const result = await executeTrackSearch(request, query, limit, offset);
    return NextResponse.json(result);
  } catch (error: any) {
    return mapSearchError(error, request);
  }
}
