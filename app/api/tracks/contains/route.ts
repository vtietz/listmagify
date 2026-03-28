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
 * POST /api/tracks/contains
 * Body: { ids: string[] }
 *
 * Proxy to provider saved-tracks contains endpoint.
 * Returns boolean[] indicating whether each track is saved to user's library.
 * Max 50 IDs per request.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const ids = Array.isArray((body as any)?.ids)
    ? ((body as any).ids as unknown[]).filter((id): id is string => typeof id === 'string' && id !== '')
    : [];

  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  if (ids.length > 50) {
    return NextResponse.json(
      { error: 'Maximum 50 IDs per request' },
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
