import { NextRequest } from 'next/server';
import { z } from 'zod';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, badRequest, notFound, fromError } from '@/app/api/_shared/http';
import { getAllSessionUserIds } from '@/lib/auth/sessionUserIds';
import { parseMusicProviderId } from '@/lib/music-provider';
import { getCanonicalTrackMetadata } from '@/lib/resolver/canonicalResolver';
import { getSyncPair } from '@/lib/sync/syncStore';
import { resolveSyncTrack, ResolveTrackError } from '@/lib/sync/resolveTrack';

const bodySchema = z.object({
  canonicalTrackId: z.string().min(1),
  targetProvider: z.string().min(1),
  providerTrackId: z.string().min(1),
  runId: z.string().min(1).optional(),
});

/**
 * POST /api/sync/pairs/[id]/resolve-track
 *
 * Fixes one track a sync could not match: stores the hand-picked match (used by
 * all future syncs) and adds the track to the pair's playlist right away.
 *
 * Body: { canonicalTrackId, targetProvider, providerTrackId, runId? }
 * `runId` is the run whose warning is shown; only that run's warnings and
 * counters are updated, and only if it belongs to this pair.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await assertAuthenticated();

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return badRequest('Expected canonicalTrackId, targetProvider and providerTrackId');
    }

    const { id } = await params;
    const pair = getSyncPair(id, getAllSessionUserIds(session));
    if (!pair) {
      return notFound('Sync pair not found');
    }

    const { canonicalTrackId, providerTrackId } = parsed.data;
    if (!getCanonicalTrackMetadata(canonicalTrackId)) {
      return notFound('Track not found');
    }

    const result = await resolveSyncTrack({
      pair,
      canonicalTrackId,
      targetProvider: parseMusicProviderId(parsed.data.targetProvider),
      providerTrackId,
      runId: parsed.data.runId,
    });

    return ok(result);
  } catch (error) {
    if (error instanceof ResolveTrackError) {
      return badRequest(error.message);
    }
    console.error('[api/sync/pairs/[id]/resolve-track] POST Error:', error);
    return fromError(error);
  }
}
