import { NextRequest } from 'next/server';
import { z } from 'zod';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, badRequest, notFound, fromError } from '@/app/api/_shared/http';
import { getAllSessionUserIds } from '@/lib/auth/sessionUserIds';
import { setSyncPairTrackSkipped } from '@/lib/sync/syncStore';

const bodySchema = z.object({
  canonicalTrackId: z.string().min(1),
  skipped: z.boolean(),
});

/**
 * PUT /api/sync/pairs/[id]/skipped
 *
 * Leaves a track out of this pair's syncs (or brings it back).
 *
 * Body: { canonicalTrackId, skipped }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await assertAuthenticated();

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return badRequest('Expected canonicalTrackId and skipped');
    }

    const { id } = await params;
    const pair = setSyncPairTrackSkipped(
      id,
      parsed.data.canonicalTrackId,
      parsed.data.skipped,
      getAllSessionUserIds(session),
    );
    if (!pair) {
      return notFound('Sync pair not found');
    }

    return ok({ skippedCanonicalIds: pair.skippedCanonicalIds });
  } catch (error) {
    console.error('[api/sync/pairs/[id]/skipped] PUT Error:', error);
    return fromError(error);
  }
}
