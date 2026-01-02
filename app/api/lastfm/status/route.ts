import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isLastfmAvailable } from '@/lib/importers/lastfm';

/**
 * GET /api/lastfm/status
 * 
 * Returns whether Last.fm import is enabled (no API calls made).
 */
export async function GET() {
  try {
    // Require authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if ((session as any).error === 'RefreshAccessTokenError') {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    return NextResponse.json({
      enabled: isLastfmAvailable(),
    });
  } catch (error) {
    console.error('[api/lastfm/status] Error:', error);
    return NextResponse.json(
      { enabled: false },
      { status: 500 }
    );
  }
}
