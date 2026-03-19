/**
 * API route to get available playback devices.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { ProviderApiError } from '@/lib/music-provider/types';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';

export async function GET(request: NextRequest) {
  try {
    const { provider } = resolveMusicProviderFromRequest(request);
    const devices = await provider.getPlaybackDevices();
    return NextResponse.json({ devices });
  } catch (error) {
    const authError = mapApiErrorToProviderAuthError(error);
    if (authError) {
      return toProviderAuthErrorResponse(authError);
    }

    if (error instanceof ProviderApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
