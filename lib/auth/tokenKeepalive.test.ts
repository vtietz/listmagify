/**
 * Unit tests for the token keepalive loop.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StoredProviderToken } from './tokenStore';
import type { ProviderJwtToken } from './tokenRefresh';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./tokenStore', () => ({
  getAllActiveTokens: vi.fn(),
  persistProviderTokens: vi.fn(),
  markTokenStatus: vi.fn(),
}));

vi.mock('./tokenRefresh', () => ({
  refreshSpotifyAccessToken: vi.fn(),
  refreshTidalAccessToken: vi.fn(),
  TOKEN_REFRESH_ERROR: 'RefreshAccessTokenError',
}));

import { startTokenKeepaliveLoop, stopTokenKeepaliveLoop } from './tokenKeepalive';
import { getAllActiveTokens, persistProviderTokens, markTokenStatus } from './tokenStore';
import {
  refreshSpotifyAccessToken,
  refreshTidalAccessToken,
  TOKEN_REFRESH_ERROR,
} from './tokenRefresh';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createToken(overrides: Partial<StoredProviderToken> = {}): StoredProviderToken {
  return {
    userId: 'user-1',
    provider: 'spotify',
    accessToken: 'old-access',
    refreshToken: 'refresh-123',
    accessTokenExpires: Date.now() + 5 * 60 * 1000, // 5 min from now (within default AHEAD_MS of 15min)
    status: 'active',
    isByok: false,
    byokClientId: null,
    byokClientSecret: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  stopTokenKeepaliveLoop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startTokenKeepaliveLoop', () => {
  it('starts the loop and runs an initial pass immediately', async () => {
    vi.mocked(getAllActiveTokens).mockReturnValue([]);

    startTokenKeepaliveLoop();

    // The initial pass is fired via `void runKeepalivePass()` — allow microtasks to flush
    await vi.advanceTimersByTimeAsync(0);

    expect(getAllActiveTokens).toHaveBeenCalledTimes(1);
  });

  it('does not start twice (idempotent)', async () => {
    vi.mocked(getAllActiveTokens).mockReturnValue([]);

    startTokenKeepaliveLoop();
    startTokenKeepaliveLoop();

    await vi.advanceTimersByTimeAsync(0);

    // Only one initial pass despite two start calls
    expect(getAllActiveTokens).toHaveBeenCalledTimes(1);
  });
});

describe('stopTokenKeepaliveLoop', () => {
  it('stops the loop (clears timeout)', async () => {
    vi.mocked(getAllActiveTokens).mockReturnValue([]);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    stopTokenKeepaliveLoop();

    vi.mocked(getAllActiveTokens).mockClear();

    // Advance past the default interval — no further passes should fire
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1000);

    expect(getAllActiveTokens).not.toHaveBeenCalled();
  });

  it('is safe to call when not started', () => {
    // Should not throw
    expect(() => stopTokenKeepaliveLoop()).not.toThrow();
  });
});

describe('runKeepalivePass behavior', () => {
  it('skips tokens that are NOT expiring soon', async () => {
    const farFutureToken = createToken({
      accessTokenExpires: Date.now() + 60 * 60 * 1000, // 1 hour away (beyond 15min threshold)
    });
    vi.mocked(getAllActiveTokens).mockReturnValue([farFutureToken]);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshSpotifyAccessToken).not.toHaveBeenCalled();
    expect(refreshTidalAccessToken).not.toHaveBeenCalled();
    expect(persistProviderTokens).not.toHaveBeenCalled();
  });

  it('refreshes tokens that ARE expiring soon (within AHEAD_MS)', async () => {
    const expiringSoonToken = createToken({
      accessTokenExpires: Date.now() + 5 * 60 * 1000, // 5 min from now, within 15min threshold
    });
    const refreshedJwt: ProviderJwtToken = {
      accessToken: 'new-access',
      refreshToken: 'refresh-123',
      accessTokenExpires: Date.now() + 3600 * 1000,
    };
    vi.mocked(getAllActiveTokens).mockReturnValue([expiringSoonToken]);
    vi.mocked(refreshSpotifyAccessToken).mockResolvedValue(refreshedJwt);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshSpotifyAccessToken).toHaveBeenCalledOnce();
    expect(persistProviderTokens).toHaveBeenCalledOnce();
  });

  it('handles tokens with null accessTokenExpires (treats as not expiring)', async () => {
    const nullExpiresToken = createToken({
      accessTokenExpires: null,
    });
    vi.mocked(getAllActiveTokens).mockReturnValue([nullExpiresToken]);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshSpotifyAccessToken).not.toHaveBeenCalled();
    expect(refreshTidalAccessToken).not.toHaveBeenCalled();
  });

  it('schedules subsequent passes after the interval', async () => {
    vi.mocked(getAllActiveTokens).mockReturnValue([]);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(getAllActiveTokens).toHaveBeenCalledTimes(1);

    // Advance past the 30-minute default interval
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(getAllActiveTokens).toHaveBeenCalledTimes(2);
  });
});

describe('refreshSingleToken behavior', () => {
  it('persists new tokens on successful refresh', async () => {
    const token = createToken();
    const refreshedJwt: ProviderJwtToken = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      accessTokenExpires: Date.now() + 3600 * 1000,
    };
    vi.mocked(getAllActiveTokens).mockReturnValue([token]);
    vi.mocked(refreshSpotifyAccessToken).mockResolvedValue(refreshedJwt);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(persistProviderTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        provider: 'spotify',
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      }),
    );
  });

  it('marks token as needs_reauth on permanent auth error', async () => {
    const token = createToken();
    const errorJwt: ProviderJwtToken = {
      accessToken: 'old-access',
      refreshToken: 'refresh-123',
      error: TOKEN_REFRESH_ERROR,
    };
    vi.mocked(getAllActiveTokens).mockReturnValue([token]);
    vi.mocked(refreshSpotifyAccessToken).mockResolvedValue(errorJwt);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(markTokenStatus).toHaveBeenCalledWith('user-1', 'spotify', 'needs_reauth');
    expect(persistProviderTokens).not.toHaveBeenCalled();
  });

  it('skips without persisting on transient failure (token returned unchanged)', async () => {
    const token = createToken({
      accessToken: 'unchanged-access',
      accessTokenExpires: Date.now() + 5 * 60 * 1000,
    });
    const unchangedJwt: ProviderJwtToken = {
      accessToken: 'unchanged-access',
      accessTokenExpires: token.accessTokenExpires!,
    };
    vi.mocked(getAllActiveTokens).mockReturnValue([token]);
    vi.mocked(refreshSpotifyAccessToken).mockResolvedValue(unchangedJwt);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(persistProviderTokens).not.toHaveBeenCalled();
    expect(markTokenStatus).not.toHaveBeenCalled();
  });

  it('catches unexpected errors and continues the loop', async () => {
    const token1 = createToken({ userId: 'user-1' });
    const token2 = createToken({ userId: 'user-2' });
    const refreshedJwt: ProviderJwtToken = {
      accessToken: 'new-access',
      refreshToken: 'refresh-123',
      accessTokenExpires: Date.now() + 3600 * 1000,
    };

    vi.mocked(getAllActiveTokens).mockReturnValue([token1, token2]);
    vi.mocked(refreshSpotifyAccessToken)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(refreshedJwt);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    // First token threw, second should still be processed
    expect(refreshSpotifyAccessToken).toHaveBeenCalledTimes(2);
    expect(persistProviderTokens).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('unexpected error'),
      expect.any(Error),
    );
  });

  it('preserves original refreshToken when refresh result omits it', async () => {
    const token = createToken({ refreshToken: 'original-refresh' });
    const refreshedJwt: ProviderJwtToken = {
      accessToken: 'new-access',
      // No refreshToken in response
      accessTokenExpires: Date.now() + 3600 * 1000,
    };
    vi.mocked(getAllActiveTokens).mockReturnValue([token]);
    vi.mocked(refreshSpotifyAccessToken).mockResolvedValue(refreshedJwt);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(persistProviderTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: 'original-refresh',
      }),
    );
  });

  it('preserves BYOK fields when persisting refreshed tokens', async () => {
    const token = createToken({
      isByok: true,
      byokClientId: 'my-client-id',
      byokClientSecret: 'my-client-secret',
    });
    const refreshedJwt: ProviderJwtToken = {
      accessToken: 'new-access',
      refreshToken: 'refresh-123',
      accessTokenExpires: Date.now() + 3600 * 1000,
      isByok: true,
      byok: { clientId: 'my-client-id', clientSecret: 'my-client-secret' },
    };
    vi.mocked(getAllActiveTokens).mockReturnValue([token]);
    vi.mocked(refreshSpotifyAccessToken).mockResolvedValue(refreshedJwt);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(persistProviderTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        isByok: true,
        byokClientId: 'my-client-id',
        byokClientSecret: 'my-client-secret',
      }),
    );
  });
});

describe('provider dispatch', () => {
  it('routes Spotify tokens to refreshSpotifyAccessToken', async () => {
    const spotifyToken = createToken({ provider: 'spotify' });
    const refreshedJwt: ProviderJwtToken = {
      accessToken: 'new-spotify-access',
      refreshToken: 'refresh-123',
      accessTokenExpires: Date.now() + 3600 * 1000,
    };
    vi.mocked(getAllActiveTokens).mockReturnValue([spotifyToken]);
    vi.mocked(refreshSpotifyAccessToken).mockResolvedValue(refreshedJwt);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshSpotifyAccessToken).toHaveBeenCalledOnce();
    expect(refreshTidalAccessToken).not.toHaveBeenCalled();
  });

  it('routes TIDAL tokens to refreshTidalAccessToken', async () => {
    const tidalToken = createToken({ provider: 'tidal' });
    const refreshedJwt: ProviderJwtToken = {
      accessToken: 'new-tidal-access',
      refreshToken: 'refresh-123',
      accessTokenExpires: Date.now() + 3600 * 1000,
    };
    vi.mocked(getAllActiveTokens).mockReturnValue([tidalToken]);
    vi.mocked(refreshTidalAccessToken).mockResolvedValue(refreshedJwt);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshTidalAccessToken).toHaveBeenCalledOnce();
    expect(refreshSpotifyAccessToken).not.toHaveBeenCalled();
  });

  it('converts StoredProviderToken to ProviderJwtToken correctly', async () => {
    const token = createToken({
      accessToken: 'stored-access',
      refreshToken: 'stored-refresh',
      accessTokenExpires: Date.now() + 5 * 60 * 1000,
      isByok: true,
      byokClientId: 'byok-id',
      byokClientSecret: 'byok-secret',
    });
    const refreshedJwt: ProviderJwtToken = {
      accessToken: 'new-access',
      refreshToken: 'stored-refresh',
      accessTokenExpires: Date.now() + 3600 * 1000,
    };
    vi.mocked(getAllActiveTokens).mockReturnValue([token]);
    vi.mocked(refreshSpotifyAccessToken).mockResolvedValue(refreshedJwt);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshSpotifyAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'stored-access',
        refreshToken: 'stored-refresh',
        accessTokenExpires: token.accessTokenExpires,
        isByok: true,
        byok: { clientId: 'byok-id', clientSecret: 'byok-secret' },
      }),
    );
  });

  it('does not include byok fields in JWT when token is not BYOK', async () => {
    const token = createToken({
      isByok: false,
      byokClientId: null,
      byokClientSecret: null,
    });
    const refreshedJwt: ProviderJwtToken = {
      accessToken: 'new-access',
      refreshToken: 'refresh-123',
      accessTokenExpires: Date.now() + 3600 * 1000,
    };
    vi.mocked(getAllActiveTokens).mockReturnValue([token]);
    vi.mocked(refreshSpotifyAccessToken).mockResolvedValue(refreshedJwt);

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    const jwtArg = vi.mocked(refreshSpotifyAccessToken).mock.calls[0]![0];
    expect(jwtArg).not.toHaveProperty('isByok');
    expect(jwtArg).not.toHaveProperty('byok');
  });

  it('handles a mix of Spotify and TIDAL tokens in a single pass', async () => {
    const spotifyToken = createToken({ userId: 'user-1', provider: 'spotify' });
    const tidalToken = createToken({ userId: 'user-2', provider: 'tidal' });

    vi.mocked(getAllActiveTokens).mockReturnValue([spotifyToken, tidalToken]);
    vi.mocked(refreshSpotifyAccessToken).mockResolvedValue({
      accessToken: 'new-spotify',
      refreshToken: 'refresh-123',
      accessTokenExpires: Date.now() + 3600 * 1000,
    });
    vi.mocked(refreshTidalAccessToken).mockResolvedValue({
      accessToken: 'new-tidal',
      refreshToken: 'refresh-123',
      accessTokenExpires: Date.now() + 3600 * 1000,
    });

    startTokenKeepaliveLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshSpotifyAccessToken).toHaveBeenCalledOnce();
    expect(refreshTidalAccessToken).toHaveBeenCalledOnce();
    expect(persistProviderTokens).toHaveBeenCalledTimes(2);
  });
});
