/**
 * API route to get available playback devices.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { ProviderApiError } from '@/lib/music-provider/types';

export async function GET(request: NextRequest) {
  try {
    const { provider } = resolveMusicProviderFromRequest(request);
    const devices = await provider.getPlaybackDevices();
    return NextResponse.json({ devices });
  } catch (error) {
    if (error instanceof ProviderApiError) {
      if (error.status === 401) {
        return NextResponse.json({ error: 'token_expired' }, { status: 401 });
      }

      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
