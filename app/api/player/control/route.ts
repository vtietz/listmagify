/**
 * API route to control playback (play, pause, next, previous, seek)
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { isAppRouteError } from '@/lib/errors';
import { parseControlPayload, runPlaybackAction } from '@/lib/services/playerControlService';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import type { ProviderId } from '@/lib/providers/types';

function mapAuthError(error: any): NextResponse | null {
  const mapped = mapApiErrorToProviderAuthError(error);
  if (mapped) {
    return toProviderAuthErrorResponse(mapped);
  }

  return null;
}

function mapKnownAppRouteError(error: any): NextResponse | null {
  if (!isAppRouteError(error)) {
    return null;
  }

  if (error.status === 400) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error.status === 404 && error.message === 'no_active_device') {
    return NextResponse.json(
      { error: 'no_active_device', message: error.detail ?? 'No active playback device found. Open your music app on a device first.' },
      { status: 404 }
    );
  }

  if (error.status === 403 && error.message === 'premium_required') {
    return NextResponse.json(
      {
        error: 'premium_required',
        message: error.detail ?? 'A premium subscription is required to control playback. You can still use this app to organize your playlists!',
      },
      { status: 403 }
    );
  }

  if (error.status === 502) {
    return NextResponse.json(
      { error: error.message, message: error.detail },
      { status: 502 }
    );
  }

  return null;
}

function mapControlError(error: any): NextResponse {
  const authError = mapAuthError(error);
  if (authError) {
    return authError;
  }

  const mappedError = mapKnownAppRouteError(error);
  if (mappedError) {
    return mappedError;
  }

  return NextResponse.json(
    { error: 'Playback control failed', message: error.message },
    { status: 500 }
  );
}

function getProviderHint(request: NextRequest): ProviderId {
  const providerValue = request.nextUrl.searchParams.get('provider')
    ?? request.headers.get('x-music-provider')
    ?? request.headers.get('x-provider');

  return providerValue === 'tidal' ? 'tidal' : 'spotify';
}

export async function POST(request: NextRequest) {
  const providerHint = getProviderHint(request);

  try {
    await assertAuthenticated();
    const { providerId } = resolveMusicProviderFromRequest(request);
    const body = await request.json();
    const payload = parseControlPayload(body);
    await runPlaybackAction(payload, providerId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const authError = mapApiErrorToProviderAuthError(error, providerHint);
    if (authError) {
      return toProviderAuthErrorResponse(authError);
    }

    return mapControlError(error);
  }
}
