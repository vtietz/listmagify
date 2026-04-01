import { describe, expect, it, vi } from 'vitest';
import { getManagedSession } from '@/lib/auth/tokenManager';

vi.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: vi.fn().mockResolvedValue({
    user: { id: 'test-user' },
    accessToken: 'test-token',
    accessTokenExpires: Date.now() + 3600_000,
    providerId: 'spotify',
  }),
}));

describe('getManagedSession', () => {
  it('delegates to requireAuth', async () => {
    const { requireAuth } = await import('@/lib/auth/requireAuth');
    const session = await getManagedSession('spotify');

    expect(requireAuth).toHaveBeenCalledWith('spotify');
    expect(session.accessToken).toBe('test-token');
  });

  it('passes undefined when no provider specified', async () => {
    const { requireAuth } = await import('@/lib/auth/requireAuth');
    await getManagedSession();

    expect(requireAuth).toHaveBeenCalledWith(undefined);
  });
});
