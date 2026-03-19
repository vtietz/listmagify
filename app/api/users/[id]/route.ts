import { NextRequest, NextResponse } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { getMusicProviderHintFromRequest, resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { mapApiErrorToProviderAuthError, toProviderAuthErrorResponse } from '@/lib/api/errorHandler';
import { isAppRouteError } from '@/lib/errors';
import { ProviderApiError } from '@/lib/music-provider/types';

function mapFallbackUser(userId: string) {
  return {
    id: userId,
    displayName: null,
    imageUrl: null,
  };
}

function mapUserResponse(user: any) {
  return {
    id: user.id,
    displayName: user.displayName || null,
    imageUrl: user.imageUrl || null,
  };
}

/**
 * GET /api/users/[id]
 * 
 * Fetches a music provider user's public profile.
 * Returns: { id, displayName, imageUrl }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertAuthenticated();

    const { id: userId } = await params;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const { provider } = resolveMusicProviderFromRequest(request);
    const user = await provider.getUserProfile(userId);
    return NextResponse.json(mapUserResponse(user));
  } catch (error) {
    const authError = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
    if (authError) {
      return toProviderAuthErrorResponse(authError);
    }

    if (error instanceof ProviderApiError) {
      if (error.status === 404) {
        const { id: userId } = await params;
        return NextResponse.json(mapFallbackUser(userId));
      }

      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }

    if (isAppRouteError(error) && error.status === 401) {
      const mapped = mapApiErrorToProviderAuthError(error, getMusicProviderHintFromRequest(request));
      if (mapped) {
        return toProviderAuthErrorResponse(mapped);
      }
    }

    console.error('[api/users] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
