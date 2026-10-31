import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/tokenStore', () => ({
  getTokenStatus: vi.fn(),
}));

import { getTokenStatus } from '@/lib/auth/tokenStore';
import { describeMissingSession } from '@/lib/auth/missingSessionMessage';

const mockedGetTokenStatus = vi.mocked(getTokenStatus);

describe('describeMissingSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports missing token storage configuration', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '');

    expect(describeMissingSession('spotify:user-1', 'spotify')).toBe(
      'Token storage not configured for spotify (TOKEN_ENCRYPTION_KEY missing); cannot load session for user=spotify:user-1',
    );
    expect(mockedGetTokenStatus).not.toHaveBeenCalled();
  });

  it.each(['needs_reauth', 'revoked'] as const)('asks for re-authentication when status is %s', (status) => {
    mockedGetTokenStatus.mockReturnValue(status);

    expect(describeMissingSession('tidal:42', 'tidal')).toBe(
      `Re-authentication required for tidal, user=tidal:42 (token status: ${status})`,
    );
  });

  it('reports no stored session when nothing is stored', () => {
    mockedGetTokenStatus.mockReturnValue(null);

    expect(describeMissingSession('spotify:user-1', 'spotify')).toBe(
      'No stored active session for spotify, user=spotify:user-1',
    );
  });
});
