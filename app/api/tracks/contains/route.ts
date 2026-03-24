import { NextRequest, NextResponse } from 'next/server';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { ProviderApiError } from '@/lib/music-provider/types';
import { isTrackIdCompatibleWithProvider } from '@/lib/providers/trackIdCompat';

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

  const indexedIds = ids.map((id, index) => ({ id, index }));
  const compatible = indexedIds.filter(({ id }) => isTrackIdCompatibleWithProvider(id, providerId));
  const incompatible = indexedIds.filter(({ id }) => !isTrackIdCompatibleWithProvider(id, providerId));

  if (compatible.length === 0) {
    return NextResponse.json(new Array(ids.length).fill(false));
  }

  try {
    const data = await provider.containsTracks({ ids: compatible.map(({ id }) => id) });

    const result = new Array<boolean>(ids.length).fill(false);
    compatible.forEach(({ index }, compatibleIndex) => {
      result[index] = Boolean(data[compatibleIndex]);
    });

    if (incompatible.length > 0) {
      console.warn('[api/tracks/contains] Filtered incompatible track IDs for provider', {
        provider: providerId,
        total: ids.length,
        compatible: compatible.length,
        incompatible: incompatible.length,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
    if (authError) {
      return toProviderAuthErrorResponse(authError);
    }

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
