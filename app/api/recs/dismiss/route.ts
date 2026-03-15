import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { isAppRouteError } from '@/lib/errors';
import { isRecsAvailable, dismissRecommendation, clearDismissals } from '@/lib/recs';

function mapDismissRouteError(error: unknown): NextResponse | null {
  if (isAppRouteError(error) && error.status === 401) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  return null;
}

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
    await assertAuthenticated();

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
    const mapped = mapDismissRouteError(error);
    if (mapped) {
      return mapped;
    }

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
    await assertAuthenticated();

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
    const mapped = mapDismissRouteError(error);
    if (mapped) {
      return mapped;
    }

    console.error('[api/recs/dismiss] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
