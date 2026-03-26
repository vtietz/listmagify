import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: {
    NEXTAUTH_SECRET: 'test-secret',
    SPOTIFY_CLIENT_ID: 'spotify-client-id',
    SPOTIFY_CLIENT_SECRET: 'spotify-client-secret',
    TIDAL_CLIENT_ID: 'tidal-client-id',
    TIDAL_CLIENT_SECRET: 'tidal-client-secret',
    MUSIC_PROVIDERS: ['spotify', 'tidal'],
  },
}));

vi.mock('@/lib/auth/authProviderFactories', () => ({
  createSpotifyAuthProvider: () => ({ id: 'spotify' }),
  createTidalAuthProvider: () => ({ id: 'tidal' }),
  TIDAL_TOKEN_URL: 'https://auth.tidal.com/v1/oauth2/token',
}));

vi.mock('@/lib/auth/authBackupCookie', () => ({
  restoreProviderTokensFromBackup: vi.fn(async () => {}),
}));

import { authOptions } from '@/lib/auth/auth';

describe('auth jwt callback refresh handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('marks provider as refresh failed without noisy warning when refresh token is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const initialToken = {
      musicProviderTokens: {
        tidal: {
          accessToken: 'tidal-access-token',
          accessTokenExpires: Date.now() - 1_000,
        },
      },
      providerErrors: {},
    };

    const jwtCallback = authOptions.callbacks?.jwt;
    expect(jwtCallback).toBeDefined();

    const result = await jwtCallback!({
      token: initialToken,
      account: null,
      trigger: 'update',
      session: null,
    });

    expect(result.musicProviderTokens?.tidal?.error).toBe('RefreshAccessTokenError');
    expect(result.providerErrors?.tidal).toBe('RefreshAccessTokenError');
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockClear();

    await jwtCallback!({
      token: result,
      account: null,
      trigger: 'update',
      session: null,
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
