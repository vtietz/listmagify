import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ServerAuthError } from '@/lib/auth/requireAuth';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { ProviderApiError } from '@/lib/music-provider/types';
import { logTrackAdd } from '@/lib/metrics/api-helpers';
import type { MusicProvider } from '@/lib/music-provider/types';

const TRACK_ADD_BATCH_SIZE = 100;

type AddTracksInput = {
  playlistId: string;
  trackUris: string[];
  position?: number;
  snapshotId?: string;
};

async function parseAddTracksInput(
  request: NextRequest,
  params: Promise<{ id: string }>
): Promise<AddTracksInput | NextResponse> {
  const { id: playlistId } = await params;

  if (!playlistId || typeof playlistId !== 'string') {
    return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { trackUris, position, snapshotId } = body;

  if (!Array.isArray(trackUris) || trackUris.length === 0) {
    return NextResponse.json({ error: 'trackUris must be a non-empty array' }, { status: 400 });
  }

  if (!trackUris.every((uri) => typeof uri === 'string' && uri.length > 0)) {
    return NextResponse.json({ error: 'All track URIs must be non-empty strings' }, { status: 400 });
  }

  if (position !== undefined && (typeof position !== 'number' || position < 0)) {
    return NextResponse.json({ error: 'position must be a non-negative number' }, { status: 400 });
  }

  return {
    playlistId,
    trackUris,
    ...(typeof position === 'number' ? { position } : {}),
    ...(typeof snapshotId === 'string' ? { snapshotId } : {}),
  };
}

function mapTrackAddResponseError(
  res: Response,
  text: string,
  batchIndex: number,
  totalTrackUris: number
): NextResponse {
  if (res.status === 401) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  let errorMessage = `Failed to add tracks: ${res.status} ${res.statusText}`;
  if (res.status === 400) {
    errorMessage = 'Invalid request. Check that all track URIs are valid.';
  } else if (res.status === 403) {
    errorMessage = "You don't have permission to modify this playlist.";
  } else if (res.status === 404) {
    errorMessage = 'Playlist not found.';
  }

  const batchNum = Math.floor(batchIndex / TRACK_ADD_BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(totalTrackUris / TRACK_ADD_BATCH_SIZE);
  return NextResponse.json(
    { error: `${errorMessage} (batch ${batchNum}/${totalBatches})`, details: text },
    { status: res.status }
  );
}

async function addTrackBatches(
  provider: MusicProvider,
  input: AddTracksInput
): Promise<string | NextResponse> {
  try {
    const result = await provider.addTracks({
      playlistId: input.playlistId,
      trackUris: input.trackUris,
      ...(typeof input.position === 'number' ? { position: input.position } : {}),
      ...(typeof input.snapshotId === 'string' ? { snapshotId: input.snapshotId } : {}),
    });
    return result.snapshotId;
  } catch (error) {
    if (error instanceof ProviderApiError) {
      return mapTrackAddResponseError(
        new Response(error.details ?? '', { status: error.status, statusText: error.message }),
        error.details ?? error.message,
        0,
        input.trackUris.length
      );
    }

    throw error;
  }
}

function mapTrackAddThrownError(error: unknown): NextResponse {
  if (error instanceof ServerAuthError) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  console.error('[api/playlists/tracks/add] Error:', error);

  const errorMessage = error instanceof Error ? error.message : String(error);
  if (
    errorMessage.includes('401') ||
    errorMessage.includes('Unauthorized') ||
    errorMessage.includes('access token expired')
  ) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Internal server error' },
    { status: 500 }
  );
}

/**
 * POST /api/playlists/[id]/tracks/add
 *
 * Adds tracks to a playlist at a specific position.
 * Used for copy and move operations in the split grid.
 *
 * Body: { trackUris: string[], position?: number, snapshotId?: string }
 * Returns: { snapshotId: string } on success
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();

    const input = await parseAddTracksInput(request, params);
    if (input instanceof NextResponse) {
      return input;
    }

    const { provider } = resolveMusicProviderFromRequest(request);
    const snapshotId = await addTrackBatches(provider, input);
    if (snapshotId instanceof NextResponse) {
      return snapshotId;
    }

    if (!snapshotId) {
      console.warn('[api/playlists/tracks/add] No snapshot_id in response');
      return NextResponse.json(
        { error: 'Add succeeded but no snapshot_id returned' },
        { status: 500 }
      );
    }

    // Log metrics (fire-and-forget, non-blocking)
    logTrackAdd(input.playlistId, input.trackUris.length).catch(() => {});

    return NextResponse.json({ snapshotId });
  } catch (error) {
    return mapTrackAddThrownError(error);
  }
}
