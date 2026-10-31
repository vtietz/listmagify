import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogAuthEvent = vi.fn();
const mockStartSession = vi.fn();
const mockEncode = vi.fn();

const PENDING_COOKIE_NAME = '__listmagify_byok_spotify';
let pendingCookie: string | undefined;

function createRequest(url: string) {
  const cookieValue = pendingCookie;
  return {
    nextUrl: new URL(url),
    cookies: {
      get: (name: string) => (name === PENDING_COOKIE_NAME && cookieValue ? { value: cookieValue } : undefined),
    },
  } as any;
}

/**
 * Create an opaque state plus the matching encrypted pending-auth cookie,
 * as the Spotify BYOK init route would.
 */
async function buildState(callbackUrl = '/split-editor') {
  const { NextResponse } = await import('next/server');
  const { createByokState, setByokPendingAuth } = await import('@/lib/auth/byokPendingAuth');

  const state = createByokState();
  const response = NextResponse.json({});
  setByokPendingAuth(response, 'spotify', state, {
    clientId: '123456789012345678901',
    clientSecret: 'abcdefghijklmnopqrstuvwxyz123456',
    callbackUrl,
  });

  pendingCookie = response.cookies.get(PENDING_COOKIE_NAME)?.value;
  return state;
}

function stubSpotifyFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/api/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
        }),
        { status: 200 }
      );
    }

    return new Response(
      JSON.stringify({
        id: 'userid',
        display_name: 'Displayname',
        email: 'test@example.com',
        images: [],
      }),
      { status: 200 }
    );
  }));
}

vi.mock('next-auth/jwt', () => ({
  encode: mockEncode,
}));

vi.mock('@/lib/metrics', () => ({
  logAuthEvent: mockLogAuthEvent,
  startSession: mockStartSession,
}));

describe('BYOK callback session cookie naming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingCookie = undefined;
    mockEncode.mockResolvedValue('mock-session-token');
  });

  it('sets __Secure-next-auth.session-token on HTTPS', async () => {
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        SPOTIFY_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'https://listmagify.com',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/callback/route');

    stubSpotifyFetch();
    const state = await buildState();

    const request = createRequest(
      `https://listmagify.com/api/auth/byok/callback?code=test-code&state=${state}`
    );

    const response = await GET(request);
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.headers.get('location')).toBe('https://listmagify.com/split-editor');
    expect(setCookie).toContain('__Secure-next-auth.session-token=mock-session-token');
  });

  it('sets next-auth.session-token on HTTP', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        SPOTIFY_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/callback/route');

    stubSpotifyFetch();
    const state = await buildState();

    const request = createRequest(
      `http://127.0.0.1:3000/api/auth/byok/callback?code=test-code&state=${state}`
    );

    const response = await GET(request);
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/split-editor');
    expect(setCookie).toContain('next-auth.session-token=mock-session-token');
    expect(setCookie).not.toContain('__Secure-next-auth.session-token=mock-session-token');
  });
});

describe('BYOK callback state binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingCookie = undefined;
    mockEncode.mockResolvedValue('mock-session-token');
  });

  it('rejects a callback whose state does not match the pending cookie', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        SPOTIFY_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/callback/route');
    stubSpotifyFetch();
    await buildState();

    const request = createRequest(
      'http://127.0.0.1:3000/api/auth/byok/callback?code=test-code&state=forged-state'
    );

    const response = await GET(request);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/?error=state_mismatch');
    expect(mockEncode).not.toHaveBeenCalled();
  });

  it('never redirects to another origin after login', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        SPOTIFY_BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/callback/route');
    stubSpotifyFetch();
    const state = await buildState('https://evil.example.com/phish');

    const request = createRequest(
      `http://127.0.0.1:3000/api/auth/byok/callback?code=test-code&state=${state}`
    );

    const response = await GET(request);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/playlists');
  });
});
