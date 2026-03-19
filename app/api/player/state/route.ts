/**
 * API route to get current playback state
 */

import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { ProviderApiError } from '@/lib/music-provider/types';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';

export async function GET(request: NextRequest) {
  try {
    const { provider } = resolveMusicProviderFromRequest(request);
    const playback = await provider.getPlaybackState();
    return NextResponse.json({ playback });
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
