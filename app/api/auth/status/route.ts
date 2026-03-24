import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth/auth';
import {
  createDefaultProviderAuthSummary,
  createProviderAuthState,
  type ProviderAuthState,
  type ProviderAuthSummary,
  type ProviderId,
} from '@/lib/providers/types';

export const dynamic = 'force-dynamic';

interface SessionProviderToken {
  accessToken?: string;
  accessTokenExpires?: number;
  error?: string;
}

interface AuthStatusSession {
  musicProviderTokens?: Partial<Record<ProviderId, SessionProviderToken>>;
  providerErrors?: Partial<Record<ProviderId, string | undefined>>;
}

const E2E_AUTH_COOKIE_NAME = 'e2e-provider-auth';

type E2EProviderCode = 'ok' | 'unauthenticated' | 'expired' | 'invalid';

function isE2EProviderCode(value: unknown): value is E2EProviderCode {
  return value === 'ok' || value === 'unauthenticated' || value === 'expired' || value === 'invalid';
}

function mapCodeToState(provider: ProviderId, code: E2EProviderCode, now: number): ProviderAuthState {
  return createProviderAuthState(provider, code, code === 'expired' || code === 'invalid', now);
}

function toE2ESummaryFromCookie(rawCookie: string | undefined): ProviderAuthSummary {
  const now = Date.now();
  const fallback = {
    spotify: 'ok',
    tidal: 'unauthenticated',
  } satisfies Record<ProviderId, E2EProviderCode>;

  if (!rawCookie) {
    const spotify = mapCodeToState('spotify', fallback.spotify, now);
    const tidal = mapCodeToState('tidal', fallback.tidal, now);
    return {
      spotify,
      tidal,
      anyAuthenticated: spotify.code === 'ok' || tidal.code === 'ok',
    };
  }

  try {
    const parsed = JSON.parse(rawCookie) as Partial<Record<ProviderId, unknown>>;
    const spotifyCode = isE2EProviderCode(parsed.spotify) ? parsed.spotify : fallback.spotify;
    const tidalCode = isE2EProviderCode(parsed.tidal) ? parsed.tidal : fallback.tidal;
    const spotify = mapCodeToState('spotify', spotifyCode, now);
    const tidal = mapCodeToState('tidal', tidalCode, now);

    return {
      spotify,
      tidal,
      anyAuthenticated: spotify.code === 'ok' || tidal.code === 'ok',
    };
  } catch {
    const spotify = mapCodeToState('spotify', fallback.spotify, now);
    const tidal = mapCodeToState('tidal', fallback.tidal, now);
    return {
      spotify,
      tidal,
      anyAuthenticated: spotify.code === 'ok' || tidal.code === 'ok',
    };
  }
}

function mapSessionProviderState(
  provider: ProviderId,
  token: SessionProviderToken | undefined,
  providerError: string | undefined,
): ProviderAuthState {
  const now = Date.now();
  const effectiveError = providerError ?? token?.error;
  const normalizedError = typeof effectiveError === 'string' ? effectiveError.toLowerCase() : '';

  if (effectiveError === 'RefreshAccessTokenError') {
    return createProviderAuthState(provider, 'expired', true, now);
  }

  if (typeof token?.accessTokenExpires === 'number' && token.accessTokenExpires <= now) {
    return createProviderAuthState(provider, 'expired', true, now);
  }

  if (normalizedError.includes('invalid')) {
    return createProviderAuthState(provider, 'invalid', true, now);
  }

  if (typeof token?.accessToken === 'string' && token.accessToken.length > 0) {
    return createProviderAuthState(provider, 'ok', true, now);
  }

  return createProviderAuthState(provider, 'unauthenticated', false, now);
}

function fromSession(session: AuthStatusSession | null): ProviderAuthSummary {
  if (!session) {
    return createDefaultProviderAuthSummary();
  }

  const providerTokens = session.musicProviderTokens ?? {};
  const providerErrors = session.providerErrors ?? {};

  const spotify = mapSessionProviderState('spotify', providerTokens.spotify, providerErrors.spotify);
  const tidal = mapSessionProviderState('tidal', providerTokens.tidal, providerErrors.tidal);

  return {
    spotify,
    tidal,
    anyAuthenticated: spotify.code === 'ok' || tidal.code === 'ok',
  };
}

export async function GET() {
  try {
    if (process.env.E2E_MODE === '1') {
      const cookieStore = await cookies();
      const rawCookieValue = cookieStore.get(E2E_AUTH_COOKIE_NAME)?.value;
      const rawCookie = rawCookieValue ? decodeURIComponent(rawCookieValue) : undefined;
      return NextResponse.json(toE2ESummaryFromCookie(rawCookie));
    }

    const session = await getServerSession(authOptions);
    const summary = fromSession(session as AuthStatusSession | null);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[api/auth/status] Failed to compute auth summary', error);
    return NextResponse.json(createDefaultProviderAuthSummary());
  }
}
