import { NextRequest, NextResponse } from 'next/server';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { ProviderApiError } from '@/lib/music-provider/types';

function getProviderErrorMessage(errorData: any, status: number): string {
  return errorData.error?.message || errorData.message || `Provider API error: ${status}`;
}

function parseProviderErrorDetails(details?: string): any {
  if (!details) {
    return {};
  }

  try {
    return JSON.parse(details);
  } catch {
    return { message: details };
  }
}

/**
 * GET /api/tracks/contains?ids=id1,id2,...
 * 
 * Proxy to provider saved-tracks contains endpoint.
 * Returns boolean[] indicating whether each track is saved to user's library.
 * Max 50 IDs per request.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');

  if (!idsParam) {
    return NextResponse.json(
      { error: 'Missing ids parameter' },
      { status: 400 }
    );
  }

  const ids = idsParam.split(',').filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  if (ids.length > 50) {
    return NextResponse.json(
      { error: 'Maximum 50 IDs per request' },
      { status: 400 }
    );
  }

  // Validate all IDs are strings (no empty values)
  if (ids.some(id => typeof id !== 'string' || id.trim() === '')) {
    return NextResponse.json(
      { error: 'Invalid ID format' },
      { status: 400 }
    );
  }

  const { providerId, provider } = resolveMusicProviderFromRequest(request);
  try {
    const data = await provider.containsTracks({ ids });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ProviderApiError) {
      const errorData = parseProviderErrorDetails(error.details);

      console.error('[api/tracks/contains] Provider API error:', {
        provider: providerId,
        status: error.status,
        idsCount: ids.length,
        error: errorData,
      });

      return NextResponse.json(
        { error: getProviderErrorMessage(errorData, error.status) },
        { status: error.status }
      );
    }

    throw error;
  }
}
