/**
 * API route to get current playback state
 */

import { NextResponse } from 'next/server';
import { spotifyFetch } from '@/lib/spotify/client';
import { mapPlaybackState, type PlaybackState } from '@/lib/spotify/playerTypes';

export async function GET() {
  try {
    const response = await spotifyFetch('/me/player', { method: 'GET' });
    
    // 204 No Content means no active device
    if (response.status === 204) {
      return NextResponse.json({ playback: null });
    }
    
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Failed to get playback state: ${response.status} ${text}`);
    }
    
    const data = await response.json();
    const playback: PlaybackState | null = mapPlaybackState(data);
    
    return NextResponse.json({ playback });
  } catch (error: any) {
    console.error('[api/player/state] Error:', error);
    
    if (error.message?.includes('Missing access token')) {
      return NextResponse.json(
        { error: 'token_expired', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to get playback state', message: error.message },
      { status: 500 }
    );
  }
}
