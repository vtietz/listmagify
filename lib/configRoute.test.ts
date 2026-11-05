import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/env', () => ({
  serverEnv: {
    PLAYLIST_POLL_INTERVAL_SECONDS: undefined,
    SPOTIFY_BYOK_ENABLED: false,
    TIDAL_BYOK_ENABLED: false,
    SYNC_INTERVAL_OPTIONS: ['1h'],
  },
}));
vi.mock('@/lib/music-provider/enabledProviders', () => ({
  getEnabledMusicProviders: () => ['spotify', 'tidal'],
}));
vi.mock('@/lib/sync/taskLimits', () => ({ getSyncTaskLimit: vi.fn() }));

import { getServerSession } from 'next-auth';
import { getSyncTaskLimit } from '@/lib/sync/taskLimits';
import { GET } from '@/app/api/config/route';

describe('GET /api/config', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the sync-task limit for the authenticated provider identities', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: 'legacy-id' },
      providerAccountIds: { spotify: 'premium-user', tidal: '42' },
      expires: '2099-01-01',
    } as never);
    vi.mocked(getSyncTaskLimit).mockReturnValue(100);

    const response = await GET();
    const body = await response.json();

    expect(getSyncTaskLimit).toHaveBeenCalledWith([
      'spotify:premium-user',
      'tidal:42',
    ]);
    expect(body.maxSyncTasksPerUser).toBe(100);
  });
});
