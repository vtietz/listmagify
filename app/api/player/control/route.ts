/**
 * API route to control playback (play, pause, next, previous, seek)
 */

import { NextRequest, NextResponse } from 'next/server';
import { spotifyFetch } from '@/lib/spotify/client';

type PlaybackAction = 'play' | 'pause' | 'next' | 'previous' | 'seek' | 'shuffle' | 'repeat' | 'volume' | 'transfer';

interface PlayRequestBody {
  action: PlaybackAction;
  deviceId?: string;
  // Play-specific options
  contextUri?: string;
  uris?: string[];
  offset?: { position: number } | { uri: string };
  positionMs?: number;
  // Seek-specific
  seekPositionMs?: number;
  // Shuffle-specific
  shuffleState?: boolean;
  // Repeat-specific
  repeatState?: 'off' | 'track' | 'context';
  // Volume-specific
  volumePercent?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: PlayRequestBody = await request.json();
    const { action, deviceId } = body;

    const deviceQuery = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';

    let response: Response;

    switch (action) {
      case 'play': {
        // Build request body for play
        const playBody: Record<string, any> = {};
        if (body.contextUri) playBody.context_uri = body.contextUri;
        if (body.uris) playBody.uris = body.uris;
        if (body.offset) playBody.offset = body.offset;
        if (typeof body.positionMs === 'number') playBody.position_ms = body.positionMs;

        const hasBody = Object.keys(playBody).length > 0;
        response = await spotifyFetch(`/me/player/play${deviceQuery}`, {
          method: 'PUT',
          ...(hasBody ? { body: JSON.stringify(playBody) } : {}),
        });
        break;
      }

      case 'pause':
        response = await spotifyFetch(`/me/player/pause${deviceQuery}`, {
          method: 'PUT',
        });
        break;

      case 'next':
        response = await spotifyFetch(`/me/player/next${deviceQuery}`, {
          method: 'POST',
        });
        break;

      case 'previous':
        response = await spotifyFetch(`/me/player/previous${deviceQuery}`, {
          method: 'POST',
        });
        break;

      case 'seek': {
        const seekMs = body.seekPositionMs ?? 0;
        response = await spotifyFetch(`/me/player/seek?position_ms=${seekMs}${deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ''}`, {
          method: 'PUT',
        });
        break;
      }

      case 'shuffle': {
        const shuffleState = body.shuffleState ?? false;
        response = await spotifyFetch(`/me/player/shuffle?state=${shuffleState}${deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ''}`, {
          method: 'PUT',
        });
        break;
      }

      case 'repeat': {
        const repeatState = body.repeatState ?? 'off';
        response = await spotifyFetch(`/me/player/repeat?state=${repeatState}${deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ''}`, {
          method: 'PUT',
        });
        break;
      }

      case 'volume': {
        const volumePercent = Math.max(0, Math.min(100, body.volumePercent ?? 50));
        response = await spotifyFetch(`/me/player/volume?volume_percent=${volumePercent}${deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ''}`, {
          method: 'PUT',
        });
        break;
      }

      case 'transfer': {
        if (!deviceId) {
          return NextResponse.json(
            { error: 'Device ID required for transfer' },
            { status: 400 }
          );
        }
        response = await spotifyFetch('/me/player', {
          method: 'PUT',
          body: JSON.stringify({
            device_ids: [deviceId],
            play: true,
          }),
        });
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    // 204 No Content is success for these endpoints
    if (response.status === 204 || response.ok) {
      return NextResponse.json({ success: true });
    }

    const errorText = await response.text().catch(() => '');
    console.error(`[api/player/control] ${action} failed:`, response.status, errorText);

    // Common error: No active device
    if (response.status === 404) {
      return NextResponse.json(
        { error: 'no_active_device', message: 'No active Spotify device found. Open Spotify on a device first.' },
        { status: 404 }
      );
    }

    // Premium required
    if (response.status === 403) {
      return NextResponse.json(
        { 
          error: 'premium_required', 
          message: 'Spotify Premium is required to control playback. You can still use this app to organize your playlists!' 
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: `Playback ${action} failed`, message: errorText },
      { status: response.status }
    );
  } catch (error: any) {
    console.error('[api/player/control] Error:', error);

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
