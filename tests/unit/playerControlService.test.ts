import { beforeEach, describe, expect, it, vi } from 'vitest';

const spotifyFetchMock = vi.fn();

vi.mock('@/lib/spotify/client', () => ({
  spotifyFetch: (...args: unknown[]) => spotifyFetchMock(...args),
}));

import { parseControlPayload, runPlaybackAction } from '@/lib/services/playerControlService';

describe('playerControlService', () => {
  beforeEach(() => {
    spotifyFetchMock.mockReset();
  });

  it('validates and parses control payload', () => {
    const payload = parseControlPayload({ action: 'pause' });
    expect(payload.action).toBe('pause');
  });

  it('throws for transfer without deviceId', async () => {
    const payload = parseControlPayload({ action: 'transfer' });
    await expect(runPlaybackAction(payload)).rejects.toMatchObject({ status: 400 });
  });

  it('maps 404 response to no_active_device error', async () => {
    spotifyFetchMock.mockResolvedValue(new Response('', { status: 404 }));

    const payload = parseControlPayload({ action: 'pause' });
    await expect(runPlaybackAction(payload)).rejects.toMatchObject({
      status: 404,
      message: 'no_active_device',
    });
  });
});
