import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerFetchMock = vi.fn();
const getMusicProviderMock = vi.fn((_providerId: unknown) => ({
  fetch: (...args: unknown[]) => providerFetchMock(...args),
}));

vi.mock('@/lib/music-provider', () => ({
  getMusicProvider: (providerId: unknown) => getMusicProviderMock(providerId),
}));

import { parseControlPayload, runPlaybackAction } from '@/lib/services/playerControlService';

describe('playerControlService', () => {
  beforeEach(() => {
    providerFetchMock.mockReset();
    getMusicProviderMock.mockClear();
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
    providerFetchMock.mockResolvedValue(new Response('', { status: 404 }));

    const payload = parseControlPayload({ action: 'pause' });
    await expect(runPlaybackAction(payload)).rejects.toMatchObject({
      status: 404,
      message: 'no_active_device',
    });
  });

  it('uses explicit provider id when executing playback action', async () => {
    providerFetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const payload = parseControlPayload({ action: 'pause' });
    await runPlaybackAction(payload, 'spotify');

    expect(getMusicProviderMock).toHaveBeenCalledWith('spotify');
  });
});
