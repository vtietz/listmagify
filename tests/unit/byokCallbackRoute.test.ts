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

describe('BYOK callback session cookie naming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEncode.mockResolvedValue('mock-session-token');
  });

  it('sets __Secure-next-auth.session-token on HTTPS', async () => {
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        BYOK_ENABLED: true,
        NEXTAUTH_URL: 'https://listmagify.com',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/callback/route');

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

    const state = Buffer.from(
      JSON.stringify({
        clientId: '123456789012345678901',
        clientSecret: 'abcdefghijklmnopqrstuvwxyz123456',
        callbackUrl: '/split-editor',
        timestamp: Date.now(),
      })
    ).toString('base64url');

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
        BYOK_ENABLED: true,
        NEXTAUTH_URL: 'http://127.0.0.1:3000',
        NEXTAUTH_SECRET: 'test-secret',
      },
    }));

    const { GET } = await import('@/app/api/auth/byok/callback/route');

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

    const state = Buffer.from(
      JSON.stringify({
        clientId: '123456789012345678901',
        clientSecret: 'abcdefghijklmnopqrstuvwxyz123456',
        callbackUrl: '/split-editor',
        timestamp: Date.now(),
      })
    ).toString('base64url');

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
