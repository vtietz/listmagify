import { requiresLikedTracksVerification } from '@/lib/music-provider/capabilities';
import { toProviderTrackId } from '@/lib/music-provider/trackCodec';
import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { LIKED_TRACKS_BATCH_SIZE } from '@/lib/sync/likedSongs';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function sanitizeTrackIdsForLibrary(ids: string[]): string[] {
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    sanitized.push(id);
  }

  return sanitized;
}

async function applyLikedTracksBatchWithFallback(
  provider: MusicProvider,
  ids: string[],
  action: 'save' | 'remove',
): Promise<{ appliedCount: number; failedIds: string[]; fallbackErrors: string[] }> {
  const sanitizedIds = sanitizeTrackIdsForLibrary(ids);
  if (sanitizedIds.length === 0) {
    return { appliedCount: 0, failedIds: [], fallbackErrors: [] };
  }

  const failedIds: string[] = [];
  const fallbackErrors: string[] = [];
  let appliedCount = 0;

  for (const id of sanitizedIds) {
    try {
      if (action === 'save') {
        await provider.saveTracks({ ids: [id] });
      } else {
        await provider.removeTracks({ ids: [id] });
      }
      appliedCount += 1;
    } catch (err) {
      failedIds.push(id);
      if (fallbackErrors.length < 3) {
        fallbackErrors.push(errorMessage(err));
      }
    }
  }

  return { appliedCount, failedIds, fallbackErrors };
}

async function verifyLikedTracksBatch(
  provider: MusicProvider,
  ids: string[],
): Promise<{ confirmedCount: number; mismatchCount: number }> {
  const sanitizedIds = sanitizeTrackIdsForLibrary(ids);
  if (sanitizedIds.length === 0) {
    return { confirmedCount: 0, mismatchCount: 0 };
  }

  try {
    const contains = await provider.containsTracks({ ids: sanitizedIds });
    const confirmedCount = contains.filter(Boolean).length;
    return {
      confirmedCount,
      mismatchCount: Math.max(0, sanitizedIds.length - confirmedCount),
    };
  } catch (error) {
    console.warn('[sync/apply] liked verification failed', {
      error: errorMessage(error),
      batchSize: ids.length,
    });
    return { confirmedCount: ids.length, mismatchCount: 0 };
  }
}

async function saveLikedBatch(
  provider: MusicProvider,
  providerId: MusicProviderId,
  sanitizedIds: string[],
  originalBatchLength: number,
): Promise<{ count: number; error: string | null }> {
  try {
    await provider.saveTracks({ ids: sanitizedIds });
    if (!requiresLikedTracksVerification(providerId)) {
      return { count: sanitizedIds.length, error: null };
    }

    const verification = await verifyLikedTracksBatch(provider, sanitizedIds);
    if (verification.mismatchCount > 0) {
      return {
        count: verification.confirmedCount,
        error:
          `TIDAL verification mismatch after save (${sanitizedIds.length} tracks): `
          + `${verification.confirmedCount} confirmed, ${verification.mismatchCount} not confirmed by containsTracks`,
      };
    }

    return { count: verification.confirmedCount, error: null };
  } catch (err) {
    const fallback = await applyLikedTracksBatchWithFallback(provider, sanitizedIds, 'save');
    const sampleFailedIds = fallback.failedIds.slice(0, 5).join(', ');
    const fallbackErrorSummary = fallback.fallbackErrors.length > 0
      ? `; sample fallback errors: ${fallback.fallbackErrors.join(' | ')}`
      : '';
    const fullyRecovered = fallback.failedIds.length === 0 && fallback.fallbackErrors.length === 0;

    if (fullyRecovered) {
      console.warn('[sync/apply] save-tracks batch recovered via fallback', {
        provider: providerId,
        batchSize: originalBatchLength,
        recovered: fallback.appliedCount,
        cause: errorMessage(err),
      });
      return { count: fallback.appliedCount, error: null };
    }

    return {
      count: fallback.appliedCount,
      error:
        `Save-tracks batch failed (${originalBatchLength} tracks): ${errorMessage(err)}. `
        + `Recovered ${fallback.appliedCount}, failed ${fallback.failedIds.length}`
        + (fallback.failedIds.length > 0 ? `; sample failed IDs: ${sampleFailedIds}` : '')
        + fallbackErrorSummary,
    };
  }
}

export async function applyBatchedLikedAdds(
  uris: string[],
  provider: MusicProvider,
  providerId: MusicProviderId,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  for (const batch of chunk(uris, LIKED_TRACKS_BATCH_SIZE)) {
    const ids = batch.map((uri) => toProviderTrackId(providerId, uri));
    const sanitizedIds = sanitizeTrackIdsForLibrary(ids);
    if (sanitizedIds.length === 0) {
      continue;
    }

    const result = await saveLikedBatch(provider, providerId, sanitizedIds, batch.length);
    count += result.count;
    if (result.error) {
      errors.push(result.error);
    }
  }

  return { count, errors };
}

export async function applyBatchedLikedRemoves(
  uris: string[],
  provider: MusicProvider,
  providerId: MusicProviderId,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  for (const batch of chunk(uris, LIKED_TRACKS_BATCH_SIZE)) {
    const ids = batch.map((uri) => toProviderTrackId(providerId, uri));
    const sanitizedIds = sanitizeTrackIdsForLibrary(ids);
    if (sanitizedIds.length === 0) continue;

    try {
      await provider.removeTracks({ ids: sanitizedIds });
      count += sanitizedIds.length;
    } catch (err) {
      const fallback = await applyLikedTracksBatchWithFallback(provider, sanitizedIds, 'remove');
      count += fallback.appliedCount;

      const sampleFailedIds = fallback.failedIds.slice(0, 5).join(', ');
      const fallbackErrorSummary = fallback.fallbackErrors.length > 0
        ? `; sample fallback errors: ${fallback.fallbackErrors.join(' | ')}`
        : '';
      const fullyRecovered = fallback.failedIds.length === 0 && fallback.fallbackErrors.length === 0;

      if (fullyRecovered) {
        console.warn('[sync/apply] remove-tracks batch recovered via fallback', {
          provider: providerId,
          batchSize: batch.length,
          recovered: fallback.appliedCount,
          cause: errorMessage(err),
        });
      } else {
        errors.push(
          `Remove-tracks batch failed (${batch.length} tracks): ${errorMessage(err)}. `
          + `Recovered ${fallback.appliedCount}, failed ${fallback.failedIds.length}`
          + (fallback.failedIds.length > 0 ? `; sample failed IDs: ${sampleFailedIds}` : '')
          + fallbackErrorSummary,
        );
      }
    }
  }

  return { count, errors };
}
