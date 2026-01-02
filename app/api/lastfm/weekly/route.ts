import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isLastfmAvailable, fetchWeeklyChart } from '@/lib/importers/lastfm';

/**
 * GET /api/lastfm/weekly?user=username&from=timestamp&to=timestamp
 * 
 * Fetch weekly track chart from a Last.fm user profile.
 * Returns normalized track DTOs.
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
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    
    // Parse optional timestamps
    const from = fromParam ? parseInt(fromParam, 10) : undefined;
    const to = toParam ? parseInt(toParam, 10) : undefined;

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Fetch from Last.fm
    const result = await fetchWeeklyChart({ 
      username, 
      ...(from !== undefined && { from }),
      ...(to !== undefined && { to }),
    });

    return NextResponse.json({
      enabled: true,
      ...result,
    });
  } catch (error) {
    console.error('[api/lastfm/weekly] Error:', error);
    
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
