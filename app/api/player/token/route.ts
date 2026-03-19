/**
 * API route to get the access token for Web Playback SDK.
 * The SDK needs a fresh access token to initialize the player.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { ProviderAuthError } from '@/lib/providers/errors';
import { toProviderAuthErrorResponse } from '@/lib/api/errorHandler';

type PlayerTokenSession = {
  musicProviderTokens?: {
    spotify?: {
      accessToken?: string;
      error?: string;
    };
  };
  providerErrors?: {
    spotify?: string;
  };
  accessToken?: string;
  error?: string;
};

function resolveSpotifySessionState(session: PlayerTokenSession) {
  const spotifyProviderToken = session.musicProviderTokens?.spotify;
  const providerError = session.providerErrors?.spotify ?? spotifyProviderToken?.error;

  return {
    isRefreshError: providerError === 'RefreshAccessTokenError',
    accessToken: spotifyProviderToken?.accessToken ?? session.accessToken,
  };
}

function unauthorized(error: string) {
  return toProviderAuthErrorResponse(
    new ProviderAuthError('spotify', 'unauthenticated', error),
  );
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return unauthorized('Not authenticated - no session');
    }

    const sessionState = resolveSpotifySessionState(session as PlayerTokenSession);

    if (sessionState.isRefreshError) {
      return toProviderAuthErrorResponse(
        new ProviderAuthError('spotify', 'expired', 'token_expired'),
      );
    }

    const accessToken = sessionState.accessToken;
    if (!accessToken) {
      console.error('[api/player/token] Session exists but no accessToken:', {
        hasSession: !!session,
        sessionKeys: Object.keys(session),
        error: (session as PlayerTokenSession).error,
      });
      return unauthorized('Not authenticated - no access token');
    }

    return NextResponse.json({ accessToken });
  } catch (error: any) {
    console.error('[api/player/token] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get token', message: error.message },
      { status: 500 }
    );
  }
}
