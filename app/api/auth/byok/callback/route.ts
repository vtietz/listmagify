import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';
import { logAuthEvent, startSession } from '@/lib/metrics';

interface ByokState {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  timestamp: number;
}

/**
 * GET /api/auth/byok/callback
 * 
 * Handles the OAuth callback from Spotify when using BYOK credentials.
 * Exchanges the authorization code for tokens and creates a session.
 */
export async function GET(request: NextRequest) {
  // Check if BYOK is enabled
  if (!serverEnv.BYOK_ENABLED) {
    return NextResponse.redirect(new URL('/?error=byok_disabled', serverEnv.NEXTAUTH_URL));
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    console.error('[byok] OAuth error:', error);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error)}`, serverEnv.NEXTAUTH_URL)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/?error=missing_params', serverEnv.NEXTAUTH_URL));
  }

  try {
    // Decode state to get credentials
    const stateData: ByokState = JSON.parse(
      Buffer.from(state, 'base64url').toString('utf-8')
    );

    const { clientId, clientSecret, callbackUrl } = stateData;

    // Verify state is not too old (5 minutes max)
    if (Date.now() - stateData.timestamp > 5 * 60 * 1000) {
      return NextResponse.redirect(new URL('/?error=state_expired', serverEnv.NEXTAUTH_URL));
    }

    // Exchange code for tokens
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
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error('[byok] Token exchange failed:', errorData);
      return NextResponse.redirect(
        new URL('/?error=token_exchange_failed', serverEnv.NEXTAUTH_URL)
      );
    }

    const tokens = await tokenResponse.json();

    // Get user profile
    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      console.error('[byok] Failed to fetch profile');
      return NextResponse.redirect(
        new URL('/?error=profile_fetch_failed', serverEnv.NEXTAUTH_URL)
      );
    }

    const profile = await profileResponse.json();

    // Calculate token expiry
    const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;

    // Create JWT token compatible with NextAuth
    const token = await encode({
      token: {
        name: profile.display_name,
        email: profile.email,
        picture: profile.images?.[0]?.url,
        sub: profile.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        accessTokenExpires: expiresAt,
        isByok: true, // Mark session as using BYOK
        // Store BYOK credentials for token refresh
        byok: {
          clientId,
          clientSecret,
        },
      },
      secret: serverEnv.NEXTAUTH_SECRET,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    // Set the session cookie
    const cookieStore = await cookies();
    cookieStore.set('next-auth.session-token', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: serverEnv.NEXTAUTH_URL.startsWith('https'),
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    console.debug('[byok] Successfully authenticated user:', profile.id);

    // Track BYOK login success event
    try {
      logAuthEvent('login_success', profile.id, undefined, true); // Mark as BYOK
      startSession(profile.id);
    } catch {
      // Don't fail auth if metrics fail
    }

    // Redirect to the callback URL
    return NextResponse.redirect(new URL(callbackUrl || '/playlists', serverEnv.NEXTAUTH_URL));
  } catch (error) {
    console.error('[byok] Callback error:', error);
    return NextResponse.redirect(new URL('/?error=callback_failed', serverEnv.NEXTAUTH_URL));
  }
}
