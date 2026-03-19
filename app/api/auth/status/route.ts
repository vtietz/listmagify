import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
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

function mapSessionProviderState(
  provider: ProviderId,
  token: SessionProviderToken | undefined,
  providerError: string | undefined,
): ProviderAuthState {
  const now = Date.now();
  const effectiveError = providerError ?? token?.error;

  if (effectiveError === 'RefreshAccessTokenError') {
    return createProviderAuthState(provider, 'expired', true, now);
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
    const session = await getServerSession(authOptions);
    const summary = fromSession(session as AuthStatusSession | null);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[api/auth/status] Failed to compute auth summary', error);
    return NextResponse.json(createDefaultProviderAuthSummary());
  }
}
