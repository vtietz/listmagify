import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, badRequest, fromError } from '@/app/api/_shared/http';
import { cancelImportPlaylist } from '@/lib/import/importStore';

/**
 * POST /api/import/cancel
 *
 * Cancel a queued import playlist task.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await assertAuthenticated();
    const body = await request.json();

    if (!body.playlistEntryId) {
      return badRequest('Missing required field: playlistEntryId');
    }

    const cancelled = cancelImportPlaylist(String(body.playlistEntryId), session.user.id);
    return ok({ cancelled });
  } catch (error) {
    console.error('[api/import/cancel] Error:', error);
    return fromError(error);
  }
}
