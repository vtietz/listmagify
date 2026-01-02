import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isLastfmAvailable, fetchLovedTracks } from '@/lib/importers/lastfm';

/**
 * GET /api/lastfm/loved?user=username&page=1&limit=50
 * 
 * Fetch loved tracks from a Last.fm user profile.
 * Returns normalized track DTOs with pagination metadata.
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if ((session as any).error === 'RefreshAccessTokenError') {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    // Check if Last.fm import is enabled
    if (!isLastfmAvailable()) {
      return NextResponse.json(
        { error: 'Last.fm import is not enabled', enabled: false },
        { status: 503 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('user')?.trim().toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(25, parseInt(searchParams.get('limit') || '50', 10)));

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Fetch from Last.fm
    const result = await fetchLovedTracks({ username, page, limit });

    return NextResponse.json({
      enabled: true,
      ...result,
    });
  } catch (error) {
    console.error('[api/lastfm/loved] Error:', error);
    
    const message = error instanceof Error ? error.message : 'Internal server error';
    const isRateLimit = message.includes('Rate limit') || message.includes('error 29');
    
    return NextResponse.json(
      { 
        error: isRateLimit ? 'Rate limit exceeded. Please try again later.' : message,
        retryable: isRateLimit,
      },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
