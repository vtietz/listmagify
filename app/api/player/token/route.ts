/**
 * API route to get the access token for Web Playback SDK.
 * The SDK needs a fresh access token to initialize the player.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated - no session' },
        { status: 401 }
      );
    }
    
    // Check for token refresh errors
    if ((session as any).error === 'RefreshAccessTokenError') {
      return NextResponse.json(
        { error: 'token_expired' },
        { status: 401 }
      );
    }
    
    const accessToken = (session as any).accessToken;
    if (!accessToken) {
      console.error('[api/player/token] Session exists but no accessToken:', {
        hasSession: !!session,
        sessionKeys: Object.keys(session),
        error: (session as any).error,
      });
      return NextResponse.json(
        { error: 'Not authenticated - no access token' },
        { status: 401 }
      );
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
