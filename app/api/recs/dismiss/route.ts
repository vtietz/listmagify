import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isRecsAvailable, dismissRecommendation, clearDismissals } from '@/lib/recs';

/**
 * POST /api/recs/dismiss
 * 
 * Dismiss a recommendation for a context.
 * Request body:
 * {
 *   trackId: string,
 *   contextId?: string   // Optional: playlist ID or 'global' (default: 'global')
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if ((session as any).error === 'RefreshAccessTokenError') {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if (!isRecsAvailable()) {
      return NextResponse.json({
        success: false,
        enabled: false,
        message: 'Recommendation system is not enabled',
      });
    }

    const body = await request.json();
    const { trackId, contextId = 'global' } = body;

    if (!trackId || typeof trackId !== 'string') {
      return NextResponse.json(
        { error: 'trackId is required' },
        { status: 400 }
      );
    }

    dismissRecommendation(trackId, contextId);

    return NextResponse.json({
      success: true,
      enabled: true,
    });

  } catch (error) {
    console.error('[api/recs/dismiss] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/recs/dismiss?contextId=xxx
 * 
 * Clear all dismissals for a context.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if ((session as any).error === 'RefreshAccessTokenError') {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if (!isRecsAvailable()) {
      return NextResponse.json({
        success: false,
        enabled: false,
        message: 'Recommendation system is not enabled',
      });
    }

    const contextId = request.nextUrl.searchParams.get('contextId') ?? 'global';
    
    clearDismissals(contextId);

    return NextResponse.json({
      success: true,
      enabled: true,
    });

  } catch (error) {
    console.error('[api/recs/dismiss] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
