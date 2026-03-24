import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { serverEnv } from '@/lib/env';
import { logAuthEvent, startSession } from '@/lib/metrics';

interface ByokState {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  timestamp: number;
}

function buildErrorRedirect(error: string): NextResponse {
  return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, serverEnv.NEXTAUTH_URL));
}

function parseState(state: string): ByokState {
  return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as ByokState;
}

function assertFreshState(timestamp: number): void {
  if (Date.now() - timestamp > 5 * 60 * 1000) {
    throw new Error('state_expired');
  }
}

async function exchangeToken(code: string, clientId: string, clientSecret: string) {
  const redirectUri = `${serverEnv.NEXTAUTH_URL}/api/auth/byok/callback`;

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('token_exchange_failed');
  }

  return tokenResponse.json();
}

async function fetchProfile(accessToken: string) {
  const profileResponse = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!profileResponse.ok) {
    throw new Error('profile_fetch_failed');
  }

  return profileResponse.json();
}

async function encodeSessionToken(params: {
  profile: any;
  tokens: any;
  clientId: string;
  clientSecret: string;
}) {
  const expiresAt = Date.now() + (params.tokens.expires_in ?? 3600) * 1000;

  return encode({
    token: {
      name: params.profile.display_name,
      email: params.profile.email,
      picture: params.profile.images?.[0]?.url,
      sub: params.profile.id,
      accessToken: params.tokens.access_token,
      refreshToken: params.tokens.refresh_token,
      accessTokenExpires: expiresAt,
      isByok: true,
      byok: {
        clientId: params.clientId,
        clientSecret: params.clientSecret,
      },
      musicProviderTokens: {
        spotify: {
          accessToken: params.tokens.access_token,
          refreshToken: params.tokens.refresh_token,
          accessTokenExpires: expiresAt,
          isByok: true,
          byok: {
            clientId: params.clientId,
            clientSecret: params.clientSecret,
          },
        },
      },
      providerErrors: {
        spotify: undefined,
      },
    },
    secret: serverEnv.NEXTAUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60,
  });
}

function buildRedirectResponse(callbackUrl: string, token: string): NextResponse {
  const isSecure = serverEnv.NEXTAUTH_URL.startsWith('https://');
  const sessionCookieName = isSecure
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

  const response = NextResponse.redirect(new URL(callbackUrl || '/playlists', serverEnv.NEXTAUTH_URL));

  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isSecure,
    maxAge: 30 * 24 * 60 * 60,
  });

  return response;
}

/**
 * GET /api/auth/byok/callback
 * 
 * Handles the OAuth callback from Spotify when using BYOK credentials.
 * Exchanges the authorization code for tokens and creates a session.
 */
export async function GET(request: NextRequest) {
  // Check if BYOK is enabled
  if (!serverEnv.SPOTIFY_BYOK_ENABLED) {
    return NextResponse.redirect(new URL('/?error=byok_disabled', serverEnv.NEXTAUTH_URL));
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.error('[byok] OAuth error:', error);
    return buildErrorRedirect(error);
  }

  if (!code || !state) {
    return buildErrorRedirect('missing_params');
  }

  try {
    const stateData = parseState(state);
    assertFreshState(stateData.timestamp);

    const { clientId, clientSecret, callbackUrl } = stateData;
    const tokens = await exchangeToken(code, clientId, clientSecret);
    const profile = await fetchProfile(tokens.access_token);
    const token = await encodeSessionToken({ profile, tokens, clientId, clientSecret });
    const redirectResponse = buildRedirectResponse(callbackUrl, token);

    console.debug('[byok] Successfully authenticated user:', profile.id);

    // Track BYOK login success event
    try {
      logAuthEvent('login_success', profile.id, undefined, true, 'spotify'); // Mark as BYOK
      startSession(profile.id, undefined, 'spotify');
    } catch {
      // Don't fail auth if metrics fail
    }

    // Redirect to the callback URL with session cookie set
    return redirectResponse;
  } catch (error) {
    console.error('[byok] Callback error:', error);
    const message = error instanceof Error ? error.message : 'callback_failed';
    const knownError = ['state_expired', 'token_exchange_failed', 'profile_fetch_failed'].includes(message)
      ? message
      : 'callback_failed';
    return buildErrorRedirect(knownError);
  }
}
