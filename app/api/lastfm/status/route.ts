import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isLastfmAvailable } from '@/lib/importers/lastfm';
import { ProviderAuthError } from '@/lib/providers/errors';
import { toProviderAuthErrorResponse } from '@/lib/api/errorHandler';

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
      return toProviderAuthErrorResponse(
        new ProviderAuthError('spotify', 'unauthenticated', 'Authentication required'),
      );
    }

    if ((session as any).error === 'RefreshAccessTokenError') {
      return toProviderAuthErrorResponse(
        new ProviderAuthError('spotify', 'expired', 'token_expired'),
      );
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
