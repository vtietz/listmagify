import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogAuthEvent = vi.fn();
const mockStartSession = vi.fn();
const mockEncode = vi.fn();

function createRequest(url: string) {
  return {
    nextUrl: new URL(url),
  } as any;
}

vi.mock('next-auth/jwt', () => ({
  encode: mockEncode,
}));

vi.mock('@/lib/metrics', () => ({
  logAuthEvent: mockLogAuthEvent,
  startSession: mockStartSession,
}));

/**
 * Build a base64url-encoded state parameter matching the TidalByokState shape
 * expected by the TIDAL BYOK callback route.
 */
function buildState(overrides: Partial<{
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  timestamp: number;
  codeVerifier: string;
}> = {}) {
  return Buffer.from(
    JSON.stringify({
      clientId: '123456789012345678901',
      clientSecret: 'abcdefghijklmnopqrstuvwxyz123456',
      callbackUrl: '/split-editor',
      timestamp: Date.now(),
      codeVerifier: 'test-code-verifier-value-for-pkce',
      ...overrides,
    })
  ).toString('base64url');
}

/**
 * Stub global fetch to return TIDAL-shaped token and profile responses.
 */
function stubTidalFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('oauth2/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'tidal-access-token',
          refresh_token: 'tidal-refresh-token',
          expires_in: 3600,
        }),
        { status: 200 }
      );
    }

    // TIDAL userinfo returns JSON:API-style envelope
    return new Response(
      JSON.stringify({
        data: {
          id: 'tidal-user-123',
          attributes: {
            username: 'tidaluser',
            email: 'tidal@example.com',
          },
        },
      }),
      { status: 200 }
    );
  }));
}

describe('TIDAL BYOK callback session cookie naming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEncode.mockResolvedValue('mock-tidal-session-token');
  });

  it('sets __Secure-next-auth.session-token on HTTPS', async () => {
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'https://listmagify.com',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/tidal/callback/route');
    stubTidalFetch();

    const state = buildState();
    const request = createRequest(
      `https://listmagify.com/api/auth/byok/tidal/callback?code=test-code&state=${state}`
    );

    const response = await GET(request);
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.headers.get('location')).toBe('https://listmagify.com/split-editor');
    expect(setCookie).toContain('__Secure-next-auth.session-token=mock-tidal-session-token');
  });

  it('sets next-auth.session-token on HTTP', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/tidal/callback/route');
    stubTidalFetch();

    const state = buildState();
    const request = createRequest(
      `http://127.0.0.1:3000/api/auth/byok/tidal/callback?code=test-code&state=${state}`
    );

    const response = await GET(request);
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/split-editor');
    expect(setCookie).toContain('next-auth.session-token=mock-tidal-session-token');
    expect(setCookie).not.toContain('__Secure-next-auth.session-token');
  });
});

describe('TIDAL BYOK callback error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEncode.mockResolvedValue('mock-tidal-session-token');
  });

  it('redirects with error when BYOK is disabled', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: false,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/tidal/callback/route');

    const request = createRequest(
      'http://127.0.0.1:3000/api/auth/byok/tidal/callback?code=test-code&state=test'
    );

    const response = await GET(request);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/?error=byok_disabled');
  });

  it('redirects with state_expired when state is too old', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/tidal/callback/route');

    const state = buildState({ timestamp: Date.now() - 10 * 60 * 1000 });
    const request = createRequest(
      `http://127.0.0.1:3000/api/auth/byok/tidal/callback?code=test-code&state=${state}`
    );

    const response = await GET(request);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/?error=state_expired');
  });

  it('redirects with missing_params when code is absent', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/tidal/callback/route');

    const request = createRequest(
      'http://127.0.0.1:3000/api/auth/byok/tidal/callback?state=some-state'
    );

    const response = await GET(request);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/?error=missing_params');
  });

  it('redirects with token_exchange_failed when TIDAL rejects the code', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/tidal/callback/route');

    vi.stubGlobal('fetch', vi.fn(async () => {
      return new Response(
        JSON.stringify({ error: 'invalid_grant' }),
        { status: 400 }
      );
    }));

    const state = buildState();
    const request = createRequest(
      `http://127.0.0.1:3000/api/auth/byok/tidal/callback?code=bad-code&state=${state}`
    );

    const response = await GET(request);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/?error=token_exchange_failed');
  });

  it('forwards OAuth error from TIDAL', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/tidal/callback/route');

    const request = createRequest(
      'http://127.0.0.1:3000/api/auth/byok/tidal/callback?error=access_denied'
    );

    const response = await GET(request);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/?error=access_denied');
  });
});

describe('TIDAL BYOK callback token structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEncode.mockResolvedValue('mock-tidal-session-token');
  });

  it('tracks auth event and starts session on success', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/tidal/callback/route');
    stubTidalFetch();

    const state = buildState();
    const request = createRequest(
      `http://127.0.0.1:3000/api/auth/byok/tidal/callback?code=test-code&state=${state}`
    );

    await GET(request);

    expect(mockLogAuthEvent).toHaveBeenCalledWith('login_success', 'tidal-user-123', undefined, true, 'tidal');
    expect(mockStartSession).toHaveBeenCalledWith('tidal-user-123', undefined, 'tidal');
  });

  it('includes BYOK credentials and TIDAL tokens in JWT', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/tidal/callback/route');
    stubTidalFetch();

    const state = buildState();
    const request = createRequest(
      `http://127.0.0.1:3000/api/auth/byok/tidal/callback?code=test-code&state=${state}`
    );

    await GET(request);

    expect(mockEncode).toHaveBeenCalledTimes(1);
    const encodedToken = mockEncode.mock.calls[0]![0].token;

    // Top-level BYOK flag
    expect(encodedToken.isByok).toBe(true);
    expect(encodedToken.byok.clientId).toBe('123456789012345678901');
    expect(encodedToken.byok.clientSecret).toBe('abcdefghijklmnopqrstuvwxyz123456');

    // Provider-specific token
    expect(encodedToken.musicProviderTokens.tidal.isByok).toBe(true);
    expect(encodedToken.musicProviderTokens.tidal.accessToken).toBe('tidal-access-token');
    expect(encodedToken.musicProviderTokens.tidal.refreshToken).toBe('tidal-refresh-token');
    expect(encodedToken.musicProviderTokens.tidal.byok.clientId).toBe('123456789012345678901');

    // Provider error cleared
    expect(encodedToken.providerErrors.tidal).toBeUndefined();
  });

  it('sends code_verifier in PKCE token exchange', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/tidal/callback/route');

    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'tidal-access-token',
            refresh_token: 'tidal-refresh-token',
            expires_in: 3600,
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          data: {
            id: 'tidal-user-123',
            attributes: { username: 'tidaluser', email: null },
          },
        }),
        { status: 200 }
      );
    });

    vi.stubGlobal('fetch', fetchSpy);

    const state = buildState({ codeVerifier: 'my-pkce-verifier' });
    const request = createRequest(
      `http://127.0.0.1:3000/api/auth/byok/tidal/callback?code=test-code&state=${state}`
    );

    await GET(request);

    // The first fetch call should be the token exchange
    const tokenFetchCall = fetchSpy.mock.calls[0]!;
    const body = (tokenFetchCall as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get('code_verifier')).toBe('my-pkce-verifier');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_id')).toBe('123456789012345678901');
    expect(body.get('client_secret')).toBe('abcdefghijklmnopqrstuvwxyz123456');
  });

  it('maps TIDAL JSON:API profile correctly', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/tidal/callback/route');
    stubTidalFetch();

    const state = buildState();
    const request = createRequest(
      `http://127.0.0.1:3000/api/auth/byok/tidal/callback?code=test-code&state=${state}`
    );

    await GET(request);

    const encodedToken = mockEncode.mock.calls[0]![0].token;
    expect(encodedToken.name).toBe('tidaluser');
    expect(encodedToken.email).toBe('tidal@example.com');
    expect(encodedToken.sub).toBe('tidal-user-123');
  });
});
