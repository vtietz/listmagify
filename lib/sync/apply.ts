import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { getMusicProvider } from '@/lib/music-provider';
import { materializeCanonicalTrackIds } from '@/lib/recs/materialize';
import { createSyncMaterializeAdapter } from '@/lib/sync/materializeAdapter';
import type { SyncDiffItem, SyncPlan, SyncApplyResult, UnresolvedTrackInfo } from '@/lib/sync/types';

const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toTrackUri(providerId: MusicProviderId, trackId: string): string {
  if (trackId.includes(':')) return trackId; // already a URI
  return providerId === 'spotify' ? `spotify:track:${trackId}` : trackId;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Phase: Resolve add items to provider track URIs via materialize
// ---------------------------------------------------------------------------

interface ResolveResult {
  uris: string[];
  unresolved: string[];
  errors: string[];
}

async function resolveAddUris(
  adds: SyncDiffItem[],
  targetProvider: MusicProvider,
  targetProviderId: MusicProviderId,
): Promise<ResolveResult> {
  if (adds.length === 0) {
    return { uris: [], unresolved: [], errors: [] };
  }

  const canonicalTrackIds = adds.map((item) => item.canonicalTrackId);
  const adapter = createSyncMaterializeAdapter(targetProvider);

  try {
    const result = await materializeCanonicalTrackIds({
      provider: targetProviderId,
      canonicalTrackIds,
      adapter,
    });

    return {
      uris: result.trackIds.map((id) => toTrackUri(targetProviderId, id)),
      unresolved: result.unresolvedCanonicalIds,
      errors: [],
    };
  } catch (err) {
    return {
      uris: [],
      unresolved: canonicalTrackIds,
      errors: [`Materialize failed: ${errorMessage(err)}`],
    };
  }
}

// ---------------------------------------------------------------------------
// Phase: Apply batched mutations (add or remove)
// ---------------------------------------------------------------------------

async function applyBatchedAdds(
  uris: string[],
  provider: MusicProvider,
  playlistId: string,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  for (const batch of chunk(uris, BATCH_SIZE)) {
    try {
      await provider.addTracks({ playlistId, trackUris: batch });
      count += batch.length;
    } catch (err) {
      errors.push(`Add batch failed (${batch.length} tracks): ${errorMessage(err)}`);
    }
  }

  return { count, errors };
}

async function applyBatchedRemoves(
  uris: string[],
  provider: MusicProvider,
  playlistId: string,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  for (const batch of chunk(uris, BATCH_SIZE)) {
    try {
      await provider.removePlaylistTracks(playlistId, batch);
      count += batch.length;
    } catch (err) {
      errors.push(`Remove batch failed (${batch.length} tracks): ${errorMessage(err)}`);
    }
  }

  return { count, errors };
}

// ---------------------------------------------------------------------------
// Phase: Resolve remove items to provider track URIs
// ---------------------------------------------------------------------------

function resolveRemoveUris(
  removes: SyncDiffItem[],
  targetProviderId: MusicProviderId,
): { uris: string[]; unresolved: string[] } {
  const uris: string[] = [];
  const unresolved: string[] = [];

  for (const item of removes) {
    if (item.providerTrackId) {
      uris.push(toTrackUri(targetProviderId, item.providerTrackId));
    } else {
      unresolved.push(item.canonicalTrackId);
    }
  }

  return { uris, unresolved };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Applies a SyncPlan by materializing canonical IDs to provider-specific
 * track URIs and then executing additions and removals in batches.
 *
 * Collects errors per batch rather than aborting the entire operation so
 * partial progress is preserved.
 */
export async function applySyncPlan(plan: SyncPlan, targetProviderOverride?: MusicProvider): Promise<SyncApplyResult> {
  const targetProvider = targetProviderOverride ?? getMusicProvider(plan.targetProvider);

  const adds = plan.items.filter((item) => item.action === 'add');
  const removes = plan.items.filter((item) => item.action === 'remove');

  // Resolve canonical IDs to provider-specific URIs
  const resolved = await resolveAddUris(adds, targetProvider, plan.targetProvider);
  const removeResolved = resolveRemoveUris(removes, plan.targetProvider);

  const allUnresolvedIds = [...resolved.unresolved, ...removeResolved.unresolved];
  const allErrors = [...resolved.errors];

  // Apply additions
  if (resolved.uris.length > 0) {
    console.debug('[sync/apply] applying additions', {
      count: resolved.uris.length,
      targetPlaylist: plan.targetPlaylistId,
    });
  }
  const addResult = await applyBatchedAdds(resolved.uris, targetProvider, plan.targetPlaylistId);
  allErrors.push(...addResult.errors);

  // Apply removals
  if (removeResolved.uris.length > 0) {
    console.debug('[sync/apply] applying removals', {
      count: removeResolved.uris.length,
      targetPlaylist: plan.targetPlaylistId,
    });
  }
  const removeResult = await applyBatchedRemoves(removeResolved.uris, targetProvider, plan.targetPlaylistId);
  allErrors.push(...removeResult.errors);

  const unresolvedDetails: UnresolvedTrackInfo[] = allUnresolvedIds.map((canonicalId) => {
    const diffItem = plan.items.find((i) => i.canonicalTrackId === canonicalId);
    return {
      canonicalTrackId: canonicalId,
      title: diffItem?.title ?? '',
      artists: diffItem?.artists ?? [],
      durationMs: diffItem?.durationMs ?? 0,
      confidence: diffItem?.confidence ?? 0,
    };
  });

  console.debug('[sync/apply] sync plan applied', {
    added: addResult.count,
    removed: removeResult.count,
    unresolved: unresolvedDetails.length,
    errors: allErrors.length,
  });

  return {
    added: addResult.count,
    removed: removeResult.count,
    unresolved: unresolvedDetails,
    errors: allErrors,
  };
}
