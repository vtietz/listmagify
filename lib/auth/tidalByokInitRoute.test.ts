import { beforeEach, describe, expect, it, vi } from 'vitest';

function createRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
  } as any;
}

describe('TIDAL BYOK initiation route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 403 when TIDAL BYOK is disabled', async () => {
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: false,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { POST } = await import('@/app/api/auth/byok/tidal/route');
    const request = createRequest({
      clientId: '123456789012345678901',
      clientSecret: 'abcdefghijklmnopqrstuvwxyz123456',
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const data = await response.json();
    expect(data.error).toContain('not enabled');
  });

  it('returns 400 when credentials are missing', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { POST } = await import('@/app/api/auth/byok/tidal/route');
    const request = createRequest({});

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('required');
  });

  it('returns 400 when credentials are too short', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { POST } = await import('@/app/api/auth/byok/tidal/route');
    const request = createRequest({
      clientId: 'short',
      clientSecret: 'short',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('Invalid credentials');
  });

  it('returns authUrl with PKCE parameters when credentials are valid', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { POST } = await import('@/app/api/auth/byok/tidal/route');
    const request = createRequest({
      clientId: '123456789012345678901',
      clientSecret: 'abcdefghijklmnopqrstuvwxyz123456',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.authUrl).toBeDefined();

    const authUrl = new URL(data.authUrl);
    expect(authUrl.origin).toBe('https://login.tidal.com');
    expect(authUrl.pathname).toBe('/authorize');
    expect(authUrl.searchParams.get('client_id')).toBe('123456789012345678901');
    expect(authUrl.searchParams.get('response_type')).toBe('code');
    expect(authUrl.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3000/api/auth/byok/tidal/callback');
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authUrl.searchParams.get('code_challenge')).toBeTruthy();
    expect(authUrl.searchParams.get('state')).toBeTruthy();
    expect(authUrl.searchParams.get('scope')).toContain('playlists.read');
  });

  it('encodes state with PKCE code verifier', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { POST } = await import('@/app/api/auth/byok/tidal/route');
    const request = createRequest({
      clientId: '123456789012345678901',
      clientSecret: 'abcdefghijklmnopqrstuvwxyz123456',
      callbackUrl: '/my-playlists',
    });

    const response = await POST(request);
    const data = await response.json();
    const authUrl = new URL(data.authUrl);
    const state = authUrl.searchParams.get('state')!;

    const decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    expect(decodedState.clientId).toBe('123456789012345678901');
    expect(decodedState.clientSecret).toBe('abcdefghijklmnopqrstuvwxyz123456');
    expect(decodedState.callbackUrl).toBe('/my-playlists');
    expect(decodedState.codeVerifier).toBeTruthy();
    expect(decodedState.timestamp).toBeGreaterThan(0);
  });

  it('defaults callbackUrl to /playlists when not provided', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { POST } = await import('@/app/api/auth/byok/tidal/route');
    const request = createRequest({
      clientId: '123456789012345678901',
      clientSecret: 'abcdefghijklmnopqrstuvwxyz123456',
    });

    const response = await POST(request);
    const data = await response.json();
    const authUrl = new URL(data.authUrl);
    const state = authUrl.searchParams.get('state')!;
    const decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    expect(decodedState.callbackUrl).toBe('/playlists');
  });

  it('generates valid PKCE S256 challenge from verifier', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        TIDAL_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { POST } = await import('@/app/api/auth/byok/tidal/route');
    const request = createRequest({
      clientId: '123456789012345678901',
      clientSecret: 'abcdefghijklmnopqrstuvwxyz123456',
    });

    const response = await POST(request);
    const data = await response.json();
    const authUrl = new URL(data.authUrl);

    const state = authUrl.searchParams.get('state')!;
    const codeChallenge = authUrl.searchParams.get('code_challenge')!;
    const decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));

    // Verify the challenge is the SHA-256 hash of the verifier, base64url-encoded
    const crypto = await import('crypto');
    const expectedChallenge = crypto
      .createHash('sha256')
      .update(decodedState.codeVerifier)
      .digest('base64url');

    expect(codeChallenge).toBe(expectedChallenge);
  });
});
