import { NextRequest } from 'next/server';
import { z } from 'zod';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, badRequest, notFound, fromError } from '@/app/api/_shared/http';
import { parseMusicProviderId } from '@/lib/music-provider';
import { toProviderTrackId } from '@/lib/music-provider/trackCodec';
import { getCanonicalTrackMetadata, setManualProviderMapping } from '@/lib/resolver/canonicalResolver';

const bodySchema = z.object({
  canonicalTrackId: z.string().min(1),
  provider: z.string().min(1),
  providerTrackId: z.string().min(1),
});

/**
 * POST /api/sync/mappings
 *
 * Stores a manually chosen match: the given provider track is used for this
 * canonical track in all future syncs.
 *
 * Body: { canonicalTrackId, provider, providerTrackId }
 */
export async function POST(request: NextRequest) {
  try {
    await assertAuthenticated();

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return badRequest('Expected canonicalTrackId, provider and providerTrackId');
    }

    const provider = parseMusicProviderId(parsed.data.provider);
    const { canonicalTrackId } = parsed.data;
    if (!getCanonicalTrackMetadata(canonicalTrackId)) {
      return notFound('Track not found');
    }

    const providerTrackId = toProviderTrackId(provider, parsed.data.providerTrackId);
    setManualProviderMapping({ provider, providerTrackId, canonicalTrackId });

    return ok({ canonicalTrackId, provider, providerTrackId });
  } catch (error) {
    console.error('[api/sync/mappings] POST Error:', error);
    return fromError(error);
  }
}
