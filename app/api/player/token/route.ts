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
    
    if (!session || !(session as any).accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }
    
    return NextResponse.json({
      accessToken: (session as any).accessToken,
    });
  } catch (error: any) {
    console.error('[api/player/token] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get token', message: error.message },
      { status: 500 }
    );
  }
}
