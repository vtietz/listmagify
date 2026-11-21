import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: {
    SPOTIFY_CLIENT_ID: 'server-spotify-id',
    SPOTIFY_CLIENT_SECRET: 'server-spotify-secret',
    TIDAL_CLIENT_ID: 'server-tidal-id',
    TIDAL_CLIENT_SECRET: 'server-tidal-secret',
  },
}));

vi.mock('@/lib/auth/authProviderFactories', () => ({
  TIDAL_TOKEN_URL: 'https://auth.tidal.com/v1/oauth2/token',
}));

import {
  MissingByokCredentialsError,
  TOKEN_REFRESH_ERROR,
  refreshProviderTokenIfNeeded,
  refreshProviderTokens,
  refreshSpotifyAccessToken,
  refreshTidalAccessToken,
  resolveClientCredentials,
  resolveSpotifyClientCredentials,
  resolveTidalClientCredentials,
  type ProviderJwtToken,
  type ProviderTokenStore,
} from '@/lib/auth/tokenRefresh';
import { _resetAllCircuitBreakers, isRefreshBlocked } from '@/lib/auth/refreshCircuitBreaker';

const byokToken: ProviderJwtToken = {
  accessToken: 'access',
  refreshToken: 'refresh',
  accessTokenExpires: Date.now() - 1_000,
  isByok: true,
  byok: { clientId: 'user-client-id', clientSecret: 'user-client-secret' },
};

function sentFormParams(fetchMock: ReturnType<typeof vi.fn>): URLSearchParams {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return new URLSearchParams(init.body as string);
}

function mockTokenEndpoint() {
  const fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ access_token: 'new-access', expires_in: 3600 }),
    { status: 200 },
  ));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('resolveClientCredentials', () => {
  const server = { clientId: 'server-id', clientSecret: 'server-secret' };

  it('uses BYOK credentials when present', () => {
    expect(resolveClientCredentials('spotify', byokToken, server)).toEqual({
      clientId: 'user-client-id',
      clientSecret: 'user-client-secret',
    });
  });

  it('uses server credentials for non-BYOK tokens', () => {
    expect(resolveClientCredentials('tidal', { refreshToken: 'r' }, server)).toEqual(server);
  });

  it.each([
    ['missing', undefined],
    ['empty', { clientId: '', clientSecret: '' }],
    ['whitespace', { clientId: '  ', clientSecret: 'secret' }],
    ['partial', { clientId: 'user-client-id' }],
  ])('throws for BYOK token with %s credentials instead of falling back', (_label, byok) => {
    const token: ProviderJwtToken = { refreshToken: 'r', isByok: true, ...(byok ? { byok } : {}) };
    expect(() => resolveClientCredentials('spotify', token, server))
      .toThrow(MissingByokCredentialsError);
  });

  it('treats empty server credentials as not configured', () => {
    expect(() => resolveClientCredentials('tidal', { refreshToken: 'r' }, { clientId: '', clientSecret: 'x' }))
      .toThrow('tidal client credentials are not configured');
  });

  it('behaves identically for Spotify and TIDAL', () => {
    const emptyByok: ProviderJwtToken = { refreshToken: 'r', isByok: true, byok: { clientId: '', clientSecret: '' } };
    expect(() => resolveSpotifyClientCredentials(emptyByok)).toThrow(MissingByokCredentialsError);
    expect(() => resolveTidalClientCredentials(emptyByok)).toThrow(MissingByokCredentialsError);
    expect(resolveSpotifyClientCredentials(byokToken).clientId).toBe('user-client-id');
    expect(resolveTidalClientCredentials(byokToken).clientId).toBe('user-client-id');
  });
});

describe('provider refresh requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['spotify', refreshSpotifyAccessToken],
    ['tidal', refreshTidalAccessToken],
  ] as const)('%s refresh sends the BYOK client credentials', async (_provider, refresh) => {
    const fetchMock = mockTokenEndpoint();

    const refreshed = await refresh(byokToken);

    const params = sentFormParams(fetchMock);
    expect(params.get('client_id')).toBe('user-client-id');
    expect(params.get('client_secret')).toBe('user-client-secret');
    expect(refreshed.accessToken).toBe('new-access');
    expect(refreshed.byok).toEqual(byokToken.byok);
  });

  it.each([
    ['spotify', refreshSpotifyAccessToken],
    ['tidal', refreshTidalAccessToken],
  ] as const)('%s refresh propagates missing BYOK credentials without calling the API', async (_provider, refresh) => {
    const fetchMock = mockTokenEndpoint();

    await expect(refresh({ ...byokToken, byok: { clientId: '', clientSecret: '' } }))
      .rejects.toBeInstanceOf(MissingByokCredentialsError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('refreshProviderTokenIfNeeded with missing BYOK credentials', () => {
  beforeEach(() => {
    _resetAllCircuitBreakers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires re-auth without opening the circuit breaker', async () => {
    const providerTokens: ProviderTokenStore = {
      spotify: { ...byokToken, byok: { clientId: '', clientSecret: '' } },
    };
    const providerErrors: Partial<Record<'spotify' | 'tidal', string | undefined>> = {};

    await refreshProviderTokenIfNeeded('spotify', providerTokens, providerErrors, 'spotify:alice');

    expect(providerTokens.spotify?.error).toBe(TOKEN_REFRESH_ERROR);
    expect(providerErrors.spotify).toBe(TOKEN_REFRESH_ERROR);
    expect(isRefreshBlocked('spotify', 'spotify:alice')).toBe(false);
  });
});

describe('refreshProviderTokens circuit breaker scoping', () => {
  beforeEach(() => {
    _resetAllCircuitBreakers();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('an invalid_grant for one user does not block refreshes for another user', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'invalid_grant' }),
      { status: 400 },
    )));

    const aliceTokens: ProviderTokenStore = { spotify: { ...byokToken } };
    await refreshProviderTokens(aliceTokens, {}, () => 'spotify:alice');

    expect(aliceTokens.spotify?.error).toBe(TOKEN_REFRESH_ERROR);
    expect(isRefreshBlocked('spotify', 'spotify:alice')).toBe(true);

    const fetchMock = mockTokenEndpoint();
    const bobTokens: ProviderTokenStore = { spotify: { ...byokToken } };
    const bobErrors: Partial<Record<'spotify' | 'tidal', string | undefined>> = {};
    await refreshProviderTokens(bobTokens, bobErrors, () => 'spotify:bob');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bobTokens.spotify?.accessToken).toBe('new-access');
    expect(bobErrors.spotify).toBeUndefined();
  });
});
