/**
 * API route to get available Spotify devices
 */

import { NextResponse } from 'next/server';
import { getJSON } from '@/lib/spotify/client';
import { mapDevice, type SpotifyDevice } from '@/lib/spotify/playerTypes';

interface DevicesResponse {
  devices: any[];
}

export async function GET() {
  try {
    const data = await getJSON<DevicesResponse>('/me/player/devices');
    
    const devices: SpotifyDevice[] = (data.devices ?? []).map(mapDevice);
    
    return NextResponse.json({ devices });
  } catch (error: any) {
    console.error('[api/player/devices] Error:', error);
    
    if (error.message?.includes('Missing access token')) {
      return NextResponse.json(
        { error: 'token_expired', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to get devices', message: error.message },
      { status: 500 }
    );
  }
}
