import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
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

function tokenExpiredResponse() {
  return NextResponse.json({ error: 'token_expired' }, { status: 401 });
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

async function mapSearchError(error: any) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid query params' }, { status: 400 });
  }

  if (isAppRouteError(error) && error.status === 401) {
    return tokenExpiredResponse();
  }

  if (error instanceof ProviderApiError) {
    if (error.status === 401) {
      return tokenExpiredResponse();
    }

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
    return mapSearchError(error);
  }
}
