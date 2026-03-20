import { NextResponse } from "next/server";

const E2E_AUTH_COOKIE_NAME = 'e2e-provider-auth';

type ProviderId = 'spotify' | 'tidal';
type E2EProviderCode = 'ok' | 'unauthenticated' | 'expired' | 'invalid';

function isProviderId(value: unknown): value is ProviderId {
  return value === 'spotify' || value === 'tidal';
}

function isE2EProviderCode(value: unknown): value is E2EProviderCode {
  return value === 'ok' || value === 'unauthenticated' || value === 'expired' || value === 'invalid';
}

function parseCookieState(rawCookie: string | undefined): Record<ProviderId, E2EProviderCode> {
  const fallback: Record<ProviderId, E2EProviderCode> = {
    spotify: 'ok',
    tidal: 'unauthenticated',
  };

  if (!rawCookie) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawCookie) as Partial<Record<ProviderId, unknown>>;
    return {
      spotify: isE2EProviderCode(parsed.spotify) ? parsed.spotify : fallback.spotify,
      tidal: isE2EProviderCode(parsed.tidal) ? parsed.tidal : fallback.tidal,
    };
  } catch {
    return fallback;
  }
}

/**
 * Test login endpoint for E2E testing.
 * Only available when E2E_MODE=1.
 * Sets a test session cookie to bypass real OAuth.
 */
export async function GET(request: Request) {
  if (process.env.E2E_MODE !== '1') {
    return NextResponse.json(
      { error: "Test endpoint only available in E2E mode" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const requestedProvider = url.searchParams.get('provider');
  const provider: ProviderId = isProviderId(requestedProvider) ? requestedProvider : 'spotify';
  const existingCookie = request.headers.get('cookie')
    ?.split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${E2E_AUTH_COOKIE_NAME}=`))
    ?.split('=')[1];

  const decodedCookie = existingCookie ? decodeURIComponent(existingCookie) : undefined;
  const state = parseCookieState(decodedCookie);
  state[provider] = 'ok';

  const response = NextResponse.json({
    message: 'E2E provider auth state updated',
    provider,
    state,
    user: {
      id: 'testuser',
      email: 'test@example.com',
      name: 'Test User',
    },
  });

  response.cookies.set(E2E_AUTH_COOKIE_NAME, encodeURIComponent(JSON.stringify(state)), {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });

  return response;
}
