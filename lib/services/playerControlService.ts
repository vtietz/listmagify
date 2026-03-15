import { z } from 'zod';
import { routeErrors } from '@/lib/errors';
import { getMusicProvider } from '@/lib/music-provider';
import type { MusicProvider } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

const actionSchema = z.enum([
  'play',
  'pause',
  'next',
  'previous',
  'seek',
  'shuffle',
  'repeat',
  'volume',
  'transfer',
]);

const requestSchema = z.object({
  action: actionSchema,
  deviceId: z.string().optional(),
  contextUri: z.string().optional(),
  uris: z.array(z.string()).optional(),
  offset: z.object({ position: z.number() }).or(z.object({ uri: z.string() })).optional(),
  positionMs: z.number().optional(),
  seekPositionMs: z.number().optional(),
  shuffleState: z.boolean().optional(),
  repeatState: z.enum(['off', 'track', 'context']).optional(),
  volumePercent: z.number().optional(),
});

type ControlRequest = z.infer<typeof requestSchema>;

type ActionHandler = (provider: MusicProvider, payload: ControlRequest) => Promise<Response>;

function deviceQuery(deviceId?: string): string {
  return deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
}

const actionHandlers: Record<ControlRequest['action'], ActionHandler> = {
  play: async (provider, payload) => {
    const playBody: Record<string, unknown> = {};
    if (payload.contextUri) playBody.context_uri = payload.contextUri;
    if (payload.uris) playBody.uris = payload.uris;
    if (payload.offset) playBody.offset = payload.offset;
    if (typeof payload.positionMs === 'number') playBody.position_ms = payload.positionMs;

    return provider.fetch(`/me/player/play${deviceQuery(payload.deviceId)}`, {
      method: 'PUT',
      ...(Object.keys(playBody).length > 0 ? { body: JSON.stringify(playBody) } : {}),
    });
  },
  pause: (provider, payload) => provider.fetch(`/me/player/pause${deviceQuery(payload.deviceId)}`, { method: 'PUT' }),
  next: (provider, payload) => provider.fetch(`/me/player/next${deviceQuery(payload.deviceId)}`, { method: 'POST' }),
  previous: (provider, payload) => provider.fetch(`/me/player/previous${deviceQuery(payload.deviceId)}`, { method: 'POST' }),
  seek: (provider, payload) => {
    const seekMs = payload.seekPositionMs ?? 0;
    const device = payload.deviceId ? `&device_id=${encodeURIComponent(payload.deviceId)}` : '';
    return provider.fetch(`/me/player/seek?position_ms=${seekMs}${device}`, { method: 'PUT' });
  },
  shuffle: (provider, payload) => {
    const state = payload.shuffleState ?? false;
    const device = payload.deviceId ? `&device_id=${encodeURIComponent(payload.deviceId)}` : '';
    return provider.fetch(`/me/player/shuffle?state=${state}${device}`, { method: 'PUT' });
  },
  repeat: (provider, payload) => {
    const state = payload.repeatState ?? 'off';
    const device = payload.deviceId ? `&device_id=${encodeURIComponent(payload.deviceId)}` : '';
    return provider.fetch(`/me/player/repeat?state=${state}${device}`, { method: 'PUT' });
  },
  volume: (provider, payload) => {
    const volumePercent = Math.max(0, Math.min(100, payload.volumePercent ?? 50));
    const device = payload.deviceId ? `&device_id=${encodeURIComponent(payload.deviceId)}` : '';
    return provider.fetch(`/me/player/volume?volume_percent=${volumePercent}${device}`, { method: 'PUT' });
  },
  transfer: (provider, payload) => {
    if (!payload.deviceId) {
      throw routeErrors.badRequest('Device ID required for transfer');
    }

    return provider.fetch('/me/player', {
      method: 'PUT',
      body: JSON.stringify({
        device_ids: [payload.deviceId],
        play: true,
      }),
    });
  },
};

export function parseControlPayload(body: unknown): ControlRequest {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid control payload');
  }
  return parsed.data;
}

export async function runPlaybackAction(
  payload: ControlRequest,
  providerId: MusicProviderId = 'spotify'
): Promise<void> {
  const provider = getMusicProvider(providerId);
  const handler = actionHandlers[payload.action];
  const response = await handler(provider, payload);

  if (response.status === 204 || response.ok) {
    return;
  }

  const errorText = await response.text().catch(() => '');

  if (response.status === 404) {
    throw routeErrors.notFound('no_active_device', 'No active playback device found. Open your music app on a device first.');
  }

  if (response.status === 403) {
    throw routeErrors.forbidden(
      'premium_required',
      'A premium subscription is required to control playback. You can still use this app to organize your playlists!'
    );
  }

  throw routeErrors.upstreamFailure(`Playback ${payload.action} failed`, errorText || String(response.status));
}