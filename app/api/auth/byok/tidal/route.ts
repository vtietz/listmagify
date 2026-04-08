import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { TIDAL_AUTHORIZATION_URL, TIDAL_SCOPES } from '@/lib/auth/authProviderFactories';

/**
 * POST /api/auth/byok/tidal
 *
 * Initiates OAuth flow using user-provided TIDAL API credentials.
 * The client sends their Client ID and Client Secret from localStorage,
 * and we redirect them to TIDAL's authorization page with PKCE.
 */
export async function POST(request: NextRequest) {
  // Check if BYOK is enabled
  if (!serverEnv.TIDAL_BYOK_ENABLED) {
    return NextResponse.json(
      { error: 'TIDAL BYOK authentication is not enabled' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { clientId, clientSecret, callbackUrl } = body;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Client ID and Client Secret are required' },
        { status: 400 }
      );
    }

    // Validate credentials format (basic check)
    if (clientId.length < 20 || clientSecret.length < 20) {
      return NextResponse.json(
        { error: 'Invalid credentials format' },
        { status: 400 }
      );
    }

    // Generate PKCE challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    // Generate state for CSRF protection (includes PKCE verifier for callback)
    const state = Buffer.from(
      JSON.stringify({
        clientId,
        clientSecret,
        callbackUrl: callbackUrl || '/playlists',
        timestamp: Date.now(),
        codeVerifier,
      })
    ).toString('base64url');

    // Build TIDAL authorization URL with PKCE
    const redirectUri = `${serverEnv.NEXTAUTH_URL}/api/auth/byok/tidal/callback`;

    const authUrl = new URL(TIDAL_AUTHORIZATION_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', TIDAL_SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', codeChallenge);

    return NextResponse.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error('[byok/tidal] Error initiating auth:', error);
    return NextResponse.json(
      { error: 'Failed to initiate authentication' },
      { status: 500 }
    );
  }
}
