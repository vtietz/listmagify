import { NextRequest, NextResponse } from 'next/server';
import { getMusicProviderHintFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { isAppRouteError } from '@/lib/errors';
import { mapLastfmError } from '@/lib/services/lastfmService';

/** Statuses passed through with the mapped message (user-correctable or retryable). */
const PASS_THROUGH_STATUSES = new Set([400, 404, 429]);

function toMappedLastfmResponse(error: unknown): NextResponse {
  try {
    mapLastfmError(error);
  } catch (mapped) {
    if (isAppRouteError(mapped) && PASS_THROUGH_STATUSES.has(mapped.status)) {
      return NextResponse.json(
        { error: mapped.message, retryable: mapped.status === 429 },
        { status: mapped.status },
      );
    }

    return NextResponse.json(
      { error: mapped instanceof Error ? mapped.message : 'Internal server error', retryable: false },
      { status: 500 },
    );
  }

  return NextResponse.json({ error: 'Internal server error', retryable: false }, { status: 500 });
}

/**
 * Shared error mapping for the Last.fm browse routes (recent, loved, top, weekly).
 */
export function lastfmErrorResponse(error: unknown, request: NextRequest): NextResponse {
  const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
  if (authError) {
    return toProviderAuthErrorResponse(authError);
  }

  if (isAppRouteError(error) && error.status === 503) {
    return NextResponse.json({ error: 'Last.fm import is not enabled', enabled: false }, { status: 503 });
  }

  if (isAppRouteError(error) && error.status === 400) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return toMappedLastfmResponse(error);
}
