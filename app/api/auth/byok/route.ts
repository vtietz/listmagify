import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';

/**
 * POST /api/auth/byok
 * 
 * Initiates OAuth flow using user-provided Spotify API credentials.
 * The client sends their Client ID and Client Secret from localStorage,
 * and we redirect them to Spotify's authorization page.
 */
export async function POST(request: NextRequest) {
  // Check if BYOK is enabled
  if (!serverEnv.BYOK_ENABLED) {
    return NextResponse.json(
      { error: 'BYOK authentication is not enabled' },
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

    // Generate state for CSRF protection
    const state = Buffer.from(
      JSON.stringify({
        clientId,
        clientSecret,
        callbackUrl: callbackUrl || '/playlists',
        timestamp: Date.now(),
      })
    ).toString('base64url');

    // Build Spotify authorization URL
    const scopes = [
      'user-read-email',
      'user-read-private',
      'playlist-read-private',
      'playlist-modify-private',
      'playlist-modify-public',
      'user-library-read',
      'user-library-modify',
      'user-read-playback-state',
      'user-modify-playback-state',
      'streaming',
    ].join(' ');

    const redirectUri = `${serverEnv.NEXTAUTH_URL}/api/auth/byok/callback`;

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);

    return NextResponse.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error('[byok] Error initiating auth:', error);
    return NextResponse.json(
      { error: 'Failed to initiate authentication' },
      { status: 500 }
    );
  }
}
