import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { serverEnv } from '@/lib/env';
import { logAuthEvent, startSession } from '@/lib/metrics';
import {
  TIDAL_TOKEN_URL,
  TIDAL_USERINFO_URL,
  TIDAL_JSON_API_CONTENT_TYPE,
  mapTidalProfile,
} from '@/lib/auth/authProviderFactories';

interface TidalByokState {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  timestamp: number;
  codeVerifier: string;
}

function buildErrorRedirect(error: string): NextResponse {
  return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, serverEnv.NEXTAUTH_URL));
}

function parseState(state: string): TidalByokState {
  return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as TidalByokState;
}

function assertFreshState(timestamp: number): void {
  if (Date.now() - timestamp > 5 * 60 * 1000) {
    throw new Error('state_expired');
  }
}

async function exchangeToken(code: string, state: TidalByokState) {
  const redirectUri = `${serverEnv.NEXTAUTH_URL}/api/auth/byok/tidal/callback`;

  // TIDAL uses body params for client credentials (no Basic auth header)
  const tokenResponse = await fetch(TIDAL_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: state.clientId,
      client_secret: state.clientSecret,
      code_verifier: state.codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('token_exchange_failed');
  }

  return tokenResponse.json();
}

async function fetchProfile(accessToken: string) {
  const profileResponse = await fetch(TIDAL_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: TIDAL_JSON_API_CONTENT_TYPE,
    },
  });

  if (!profileResponse.ok) {
    throw new Error('profile_fetch_failed');
  }

  const data = await profileResponse.json();
  return mapTidalProfile(data);
}

async function encodeSessionToken(params: {
  profile: { id: string; name: string; email: string | null; image: null };
  tokens: any;
  clientId: string;
  clientSecret: string;
}) {
  const expiresAt = Date.now() + (params.tokens.expires_in ?? 3600) * 1000;

  return encode({
    token: {
      name: params.profile.name,
      email: params.profile.email,
      picture: params.profile.image,
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
        tidal: {
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
        tidal: undefined,
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
 * GET /api/auth/byok/tidal/callback
 *
 * Handles the OAuth callback from TIDAL when using BYOK credentials.
 * Exchanges the authorization code for tokens (with PKCE) and creates a session.
 */
export async function GET(request: NextRequest) {
  // Check if BYOK is enabled
  if (!serverEnv.TIDAL_BYOK_ENABLED) {
    return NextResponse.redirect(new URL('/?error=byok_disabled', serverEnv.NEXTAUTH_URL));
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.error('[byok/tidal] OAuth error:', error);
    return buildErrorRedirect(error);
  }

  if (!code || !state) {
    return buildErrorRedirect('missing_params');
  }

  try {
    const stateData = parseState(state);
    assertFreshState(stateData.timestamp);

    const tokens = await exchangeToken(code, stateData);
    const profile = await fetchProfile(tokens.access_token);
    const token = await encodeSessionToken({
      profile,
      tokens,
      clientId: stateData.clientId,
      clientSecret: stateData.clientSecret,
    });
    const redirectResponse = buildRedirectResponse(stateData.callbackUrl, token);

    console.debug('[byok/tidal] Successfully authenticated user:', profile.id);

    // Track BYOK login success event
    try {
      logAuthEvent('login_success', profile.id, undefined, true, 'tidal');
      startSession(profile.id, undefined, 'tidal');
    } catch {
      // Don't fail auth if metrics fail
    }

    // Redirect to the callback URL with session cookie set
    return redirectResponse;
  } catch (error) {
    console.error('[byok/tidal] Callback error:', error);
    const message = error instanceof Error ? error.message : 'callback_failed';
    const knownError = ['state_expired', 'token_exchange_failed', 'profile_fetch_failed'].includes(message)
      ? message
      : 'callback_failed';
    return buildErrorRedirect(knownError);
  }
}
