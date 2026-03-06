import { NextRequest, NextResponse } from 'next/server';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { ProviderApiError } from '@/lib/music-provider/types';

function getProviderErrorMessage(errorData: any, status: number): string {
  return errorData.error?.message || errorData.message || `Provider API error: ${status}`;
}

function parseProviderErrorDetails(details?: string): any {
  if (!details) {
    return {};
  }

  try {
    return JSON.parse(details);
  } catch {
    return { message: details };
  }
}

/**
 * PUT /api/tracks/save
 * Body: { ids: string[] }
 * 
 * Proxy to provider saved-tracks endpoint.
 * Saves tracks to user's "Liked Songs" library.
 * Max 50 IDs per request.
 */
export async function PUT(request: NextRequest) {
  let body: { ids?: string[] };
  
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { ids } = body;

  if (!ids || !Array.isArray(ids)) {
    return NextResponse.json(
      { error: 'Missing or invalid ids array' },
      { status: 400 }
    );
  }

  if (ids.length === 0) {
    return NextResponse.json({ success: true });
  }

  if (ids.length > 50) {
    return NextResponse.json(
      { error: 'Maximum 50 IDs per request' },
      { status: 400 }
    );
  }

  // Validate all IDs are non-empty strings
  if (ids.some(id => typeof id !== 'string' || id.trim() === '')) {
    return NextResponse.json(
      { error: 'Invalid ID format' },
      { status: 400 }
    );
  }

  // Provider adapter maps to the underlying save-tracks endpoint.
  const { providerId, provider } = resolveMusicProviderFromRequest(request);
  try {
    await provider.saveTracks({ ids });
  } catch (error) {
    if (error instanceof ProviderApiError) {
      const errorData = parseProviderErrorDetails(error.details);

      console.error('[api/tracks/save] Provider API error:', {
        provider: providerId,
        status: error.status,
        idsCount: ids.length,
        error: errorData,
      });

      return NextResponse.json(
        { error: getProviderErrorMessage(errorData, error.status) },
        { status: error.status }
      );
    }

    throw error;
  }

  return NextResponse.json({ success: true });
}
