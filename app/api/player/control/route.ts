/**
 * API route to control playback (play, pause, next, previous, seek)
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { isAppRouteError } from '@/lib/errors';
import { parseControlPayload, runPlaybackAction } from '@/lib/services/playerControlService';

export async function POST(request: NextRequest) {
  try {
    await assertAuthenticated();
    const body = await request.json();
    const payload = parseControlPayload(body);
    await runPlaybackAction(payload);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (isAppRouteError(error) && error.status === 401) {
      return NextResponse.json(
        { error: 'token_expired', message: 'Authentication required' },
        { status: 401 }
      );
    }

    if (isAppRouteError(error) && error.status === 400) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (isAppRouteError(error) && error.status === 404 && error.message === 'no_active_device') {
      return NextResponse.json(
        { error: 'no_active_device', message: error.detail ?? 'No active Spotify device found. Open Spotify on a device first.' },
        { status: 404 }
      );
    }

    if (isAppRouteError(error) && error.status === 403 && error.message === 'premium_required') {
      return NextResponse.json(
        {
          error: 'premium_required',
          message: error.detail ?? 'Spotify Premium is required to control playback. You can still use this app to organize your playlists!',
        },
        { status: 403 }
      );
    }

    if (isAppRouteError(error) && error.status === 502) {
      return NextResponse.json(
        { error: error.message, message: error.detail },
        { status: 502 }
      );
    }

    if (error.message?.includes('Missing access token')) {
      return NextResponse.json(
        { error: 'token_expired', message: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Playback control failed', message: error.message },
      { status: 500 }
    );
  }
}
