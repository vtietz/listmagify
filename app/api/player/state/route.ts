/**
 * API route to get current playback state
 */

import { NextResponse } from 'next/server';
import { spotifyFetch } from '@/lib/spotify/client';
import { mapPlaybackState, type PlaybackState } from '@/lib/spotify/playerTypes';
import { handleSpotifyResponseError, handleSpotifyException } from '@/lib/api/spotifyErrorHandler';

export async function GET() {
  try {
    const response = await spotifyFetch('/me/player', { method: 'GET' });
    
    // 204 No Content means no active device
    if (response.status === 204) {
      return NextResponse.json({ playback: null });
    }
    
    if (!response.ok) {
      return handleSpotifyResponseError(response, {
        operation: 'api/player/state',
        path: '/me/player'
      });
    }
    
    const data = await response.json();
    const playback: PlaybackState | null = mapPlaybackState(data);
    
    return NextResponse.json({ playback });
  } catch (error: any) {
    return handleSpotifyException(error, {
      operation: 'api/player/state'
    });
  }
}
