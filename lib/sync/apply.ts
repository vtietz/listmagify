import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { getMusicProvider } from '@/lib/music-provider';
import { materializeCanonicalTrackIds } from '@/lib/recs/materialize';
import { createSyncMaterializeAdapter } from '@/lib/sync/materializeAdapter';
import { isLikedSongsPlaylist, uriToTrackId, LIKED_TRACKS_BATCH_SIZE } from '@/lib/sync/likedSongs';
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

async function applyLikedTracksBatchWithFallback(
  provider: MusicProvider,
  ids: string[],
  action: 'save' | 'remove',
): Promise<{ appliedCount: number; failedIds: string[]; fallbackErrors: string[] }> {
  const failedIds: string[] = [];
  const fallbackErrors: string[] = [];
  let appliedCount = 0;

  for (const id of ids) {
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

async function verifyTidalLikedBatch(
  provider: MusicProvider,
  ids: string[],
): Promise<{ confirmedCount: number; mismatchCount: number }> {
  try {
    const contains = await provider.containsTracks({ ids });
    const confirmedCount = contains.filter(Boolean).length;
    return {
      confirmedCount,
      mismatchCount: Math.max(0, ids.length - confirmedCount),
    };
  } catch (error) {
    console.warn('[sync/apply] tidal liked verification failed', {
      error: errorMessage(error),
      batchSize: ids.length,
    });
    return { confirmedCount: ids.length, mismatchCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// Phase: Resolve add items to provider track URIs via materialize
// ---------------------------------------------------------------------------

interface UnresolvedEntry {
  canonicalTrackId: string;
  reason: UnresolvedTrackInfo['reason'];
}

interface ResolveResult {
  uris: string[];
  unresolved: UnresolvedEntry[];
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

  // Use pre-resolved target track IDs from preview when available
  const preResolved = adds.filter((i) => i.resolvedTargetTrackId && i.materializeStatus === 'resolved');
  const preUnresolved = adds.filter((i) => i.materializeStatus === 'not_found');
  const needsResolution = adds.filter((i) => !i.materializeStatus || i.materializeStatus === 'unchecked');

  // Deduplicate URIs
  const seenUris = new Set<string>();
  const uris: string[] = [];
  for (const item of preResolved) {
    const uri = toTrackUri(targetProviderId, item.resolvedTargetTrackId!);
    if (!seenUris.has(uri)) {
      seenUris.add(uri);
      uris.push(uri);
    }
  }
  const unresolved: UnresolvedEntry[] = preUnresolved.map((i) => ({
    canonicalTrackId: i.canonicalTrackId,
    reason: 'not_found' as const,
  }));
  const errors: string[] = [];

  // Fall back to materialization for any items not pre-validated
  if (needsResolution.length > 0) {
    const canonicalTrackIds = needsResolution.map((item) => item.canonicalTrackId);
    const adapter = createSyncMaterializeAdapter(targetProvider, targetProviderId);

    try {
      const result = await materializeCanonicalTrackIds({
        provider: targetProviderId,
        canonicalTrackIds,
        adapter,
      });

      uris.push(...result.trackIds.map((id) => toTrackUri(targetProviderId, id)));
      unresolved.push(...result.unresolvedCanonicalIds.map((id) => ({
        canonicalTrackId: id,
        reason: 'not_found' as const,
      })));
    } catch (err) {
      unresolved.push(...canonicalTrackIds.map((id) => ({
        canonicalTrackId: id,
        reason: 'materialize_failed' as const,
      })));
      errors.push(`Materialize failed: ${errorMessage(err)}`);
    }
  }

  return { uris, unresolved, errors };
}

// ---------------------------------------------------------------------------
// Phase: Apply batched mutations (add or remove)
// ---------------------------------------------------------------------------

async function applyBatchedAdds(
  uris: string[],
  provider: MusicProvider,
  providerId: MusicProviderId,
  playlistId: string,
  isLiked: boolean,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  if (isLiked) {
    for (const batch of chunk(uris, LIKED_TRACKS_BATCH_SIZE)) {
      const ids = batch.map((uri) => uriToTrackId(providerId, uri));
      try {
        await provider.saveTracks({ ids });
        if (providerId === 'tidal') {
          const verification = await verifyTidalLikedBatch(provider, ids);
          count += verification.confirmedCount;
          if (verification.mismatchCount > 0) {
            errors.push(
              `TIDAL verification mismatch after save (${ids.length} tracks): `
              + `${verification.confirmedCount} confirmed, ${verification.mismatchCount} not confirmed by containsTracks`,
            );
          }
        } else {
          count += batch.length;
        }
      } catch (err) {
        const fallback = await applyLikedTracksBatchWithFallback(provider, ids, 'save');
        count += fallback.appliedCount;

        const sampleFailedIds = fallback.failedIds.slice(0, 5).join(', ');
        const fallbackErrorSummary = fallback.fallbackErrors.length > 0
          ? `; sample fallback errors: ${fallback.fallbackErrors.join(' | ')}`
          : '';
        errors.push(
          `Save-tracks batch failed (${batch.length} tracks): ${errorMessage(err)}. `
          + `Recovered ${fallback.appliedCount}, failed ${fallback.failedIds.length}`
          + (fallback.failedIds.length > 0 ? `; sample failed IDs: ${sampleFailedIds}` : '')
          + fallbackErrorSummary,
        );
      }
    }
  } else {
    for (const batch of chunk(uris, BATCH_SIZE)) {
      try {
        await provider.addTracks({ playlistId, trackUris: batch });
        count += batch.length;
      } catch (err) {
        errors.push(`Add batch failed (${batch.length} tracks): ${errorMessage(err)}`);
      }
    }
  }

  return { count, errors };
}

async function applyBatchedRemoves(
  uris: string[],
  provider: MusicProvider,
  providerId: MusicProviderId,
  playlistId: string,
  isLiked: boolean,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  if (isLiked) {
    for (const batch of chunk(uris, LIKED_TRACKS_BATCH_SIZE)) {
      const ids = batch.map((uri) => uriToTrackId(providerId, uri));
      try {
        await provider.removeTracks({ ids });
        count += batch.length;
      } catch (err) {
        const fallback = await applyLikedTracksBatchWithFallback(provider, ids, 'remove');
        count += fallback.appliedCount;

        const sampleFailedIds = fallback.failedIds.slice(0, 5).join(', ');
        const fallbackErrorSummary = fallback.fallbackErrors.length > 0
          ? `; sample fallback errors: ${fallback.fallbackErrors.join(' | ')}`
          : '';
        errors.push(
          `Remove-tracks batch failed (${batch.length} tracks): ${errorMessage(err)}. `
          + `Recovered ${fallback.appliedCount}, failed ${fallback.failedIds.length}`
          + (fallback.failedIds.length > 0 ? `; sample failed IDs: ${sampleFailedIds}` : '')
          + fallbackErrorSummary,
        );
      }
    }
  } else {
    for (const batch of chunk(uris, BATCH_SIZE)) {
      try {
        await provider.removePlaylistTracks(playlistId, batch);
        count += batch.length;
      } catch (err) {
        errors.push(`Remove batch failed (${batch.length} tracks): ${errorMessage(err)}`);
      }
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
): { uris: string[]; unresolved: UnresolvedEntry[] } {
  const uris: string[] = [];
  const unresolved: UnresolvedEntry[] = [];

  for (const item of removes) {
    if (item.providerTrackId) {
      uris.push(toTrackUri(targetProviderId, item.providerTrackId));
    } else {
      unresolved.push({
        canonicalTrackId: item.canonicalTrackId,
        reason: 'no_provider_mapping',
      });
    }
  }

  return { uris, unresolved };
}

// ---------------------------------------------------------------------------
// Filter out tracks already in a playlist
// ---------------------------------------------------------------------------

async function filterAlreadyPresent(
  uris: string[],
  provider: MusicProvider,
  providerId: MusicProviderId,
  playlistId: string,
  isLiked: boolean,
): Promise<string[]> {
  if (uris.length === 0) return uris;

  try {
    if (isLiked) {
      // Use containsTracks in batches of 50 for liked songs
      const alreadyLiked = new Array<boolean>(uris.length).fill(false);
      const ids = uris.map((uri) => uriToTrackId(providerId, uri));

      for (let i = 0; i < ids.length; i += LIKED_TRACKS_BATCH_SIZE) {
        const batchIds = ids.slice(i, i + LIKED_TRACKS_BATCH_SIZE);
        const results = await provider.containsTracks({ ids: batchIds });
        for (let j = 0; j < results.length; j++) {
          alreadyLiked[i + j] = results[j]!;
        }
      }

      const filtered = uris.filter((_, idx) => !alreadyLiked[idx]);
      if (filtered.length < uris.length) {
        console.debug('[sync/apply] skipping already-liked tracks', {
          total: uris.length,
          alreadyLiked: uris.length - filtered.length,
          toAdd: filtered.length,
        });
      }
      return filtered;
    }

    const existingUris = new Set(await provider.getPlaylistTrackUris(playlistId));
    const filtered = uris.filter((uri) => !existingUris.has(uri));
    if (filtered.length < uris.length) {
      console.debug('[sync/apply] skipping already-present tracks', {
        total: uris.length,
        alreadyPresent: uris.length - filtered.length,
        toAdd: filtered.length,
      });
    }
    return filtered;
  } catch (err) {
    console.warn('[sync/apply] failed to fetch existing track URIs, proceeding without dedup', {
      error: err instanceof Error ? err.message : String(err),
    });
    return uris;
  }
}

// ---------------------------------------------------------------------------
// Phase: Reorder playlist to match desired canonical order
// ---------------------------------------------------------------------------

async function reorderPlaylist(
  provider: MusicProvider,
  providerId: MusicProviderId,
  playlistId: string,
  desiredCanonicalOrder: string[],
): Promise<void> {
  // Fetch current track URIs from the playlist
  const currentUris = await provider.getPlaylistTrackUris(playlistId);
  if (currentUris.length <= 1) return;

  // Build a map from canonical ID to provider track URI
  // We need to resolve canonical IDs to the URIs actually in the playlist.
  // Use the provider_track_map cache via toProviderTrack.
  const { toProviderTrack } = await import('@/lib/resolver/canonicalResolver');

  const canonicalToUri = new Map<string, string>();
  const currentUriSet = new Set(currentUris);

  for (const canonicalId of desiredCanonicalOrder) {
    const mapping = toProviderTrack(providerId, canonicalId);
    if (mapping) {
      const uri = toTrackUri(providerId, mapping.providerTrackId);
      if (currentUriSet.has(uri)) {
        canonicalToUri.set(canonicalId, uri);
      }
    }
  }

  // Build desired URI order: canonical order for mapped tracks, then any
  // remaining URIs that weren't in the canonical order (preserve their position)
  const orderedUris: string[] = [];
  const placed = new Set<string>();

  for (const canonicalId of desiredCanonicalOrder) {
    const uri = canonicalToUri.get(canonicalId);
    if (uri && !placed.has(uri)) {
      orderedUris.push(uri);
      placed.add(uri);
    }
  }

  // Append any tracks not in the canonical order (shouldn't happen normally)
  for (const uri of currentUris) {
    if (!placed.has(uri)) {
      orderedUris.push(uri);
      placed.add(uri);
    }
  }

  // Only replace if the order actually changed
  if (orderedUris.length === currentUris.length &&
      orderedUris.every((uri, i) => uri === currentUris[i])) {
    return;
  }

  console.debug('[sync/apply] reordering playlist', {
    provider: providerId,
    playlistId,
    trackCount: orderedUris.length,
  });

  await provider.replacePlaylistTracks(playlistId, orderedUris);
}

// ---------------------------------------------------------------------------
// Apply mutations for one side (one target provider + playlist)
// ---------------------------------------------------------------------------

interface SideResult {
  added: number;
  removed: number;
  unresolved: UnresolvedEntry[];
  errors: string[];
}

async function applySide(
  items: SyncDiffItem[],
  providerId: MusicProviderId,
  playlistId: string,
  desiredOrder?: string[],
  providerOverride?: MusicProvider,
): Promise<SideResult> {
  const provider = providerOverride ?? getMusicProvider(providerId);
  const isLiked = isLikedSongsPlaylist(playlistId);

  const adds = items.filter((i) => i.action === 'add');
  const removes = items.filter((i) => i.action === 'remove');

  const resolved = await resolveAddUris(adds, provider, providerId);
  const removeResolved = resolveRemoveUris(removes, providerId);

  const allUnresolved = [...resolved.unresolved, ...removeResolved.unresolved];
  const allErrors = [...resolved.errors];

  // Filter out tracks already in the playlist / liked songs
  const addUris = await filterAlreadyPresent(resolved.uris, provider, providerId, playlistId, isLiked);

  if (addUris.length > 0) {
    console.debug('[sync/apply] applying additions', {
      provider: providerId,
      count: addUris.length,
      targetPlaylist: playlistId,
      isLiked,
    });
  }
  const addResult = await applyBatchedAdds(addUris, provider, providerId, playlistId, isLiked);
  allErrors.push(...addResult.errors);

  if (removeResolved.uris.length > 0) {
    console.debug('[sync/apply] applying removals', {
      provider: providerId,
      count: removeResolved.uris.length,
      targetPlaylist: playlistId,
      isLiked,
    });
  }
  const removeResult = await applyBatchedRemoves(removeResolved.uris, provider, providerId, playlistId, isLiked);
  allErrors.push(...removeResult.errors);

  // Reorder to match desired track order if provided (skip for liked songs — order is by date-added)
  if (!isLiked && desiredOrder && desiredOrder.length > 0 && (addResult.count > 0 || removeResult.count > 0)) {
    try {
      await reorderPlaylist(provider, providerId, playlistId, desiredOrder);
    } catch (err) {
      allErrors.push(`Reorder failed: ${errorMessage(err)}`);
    }
  }

  return {
    added: addResult.count,
    removed: removeResult.count,
    unresolved: allUnresolved,
    errors: allErrors,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Applies a SyncPlan by materializing canonical IDs to provider-specific
 * track URIs and then executing additions and removals in batches.
 *
 * For bidirectional sync, items are grouped by their targetProvider and
 * applied to the correct playlist on each side.
 *
 * Collects errors per batch rather than aborting the entire operation so
 * partial progress is preserved.
 */
export async function applySyncPlan(
  plan: SyncPlan,
  providerOverrides?: MusicProvider | Partial<Record<MusicProviderId, MusicProvider>>,
): Promise<SyncApplyResult> {
  // Group items by their target provider
  const itemsByProvider = new Map<MusicProviderId, SyncDiffItem[]>();
  for (const item of plan.items) {
    const existing = itemsByProvider.get(item.targetProvider) ?? [];
    existing.push(item);
    itemsByProvider.set(item.targetProvider, existing);
  }

  // Map provider IDs to playlist IDs
  const playlistForProvider: Record<string, string> = {
    [plan.sourceProvider]: plan.sourcePlaylistId,
    [plan.targetProvider]: plan.targetPlaylistId,
  };

  let totalAdded = 0;
  let totalRemoved = 0;
  const allUnresolved: UnresolvedEntry[] = [];
  const allErrors: string[] = [];

  for (const [providerId, items] of itemsByProvider) {
    const playlistId = playlistForProvider[providerId];
    if (!playlistId) {
      allErrors.push(`No playlist ID for provider ${providerId}`);
      continue;
    }

    // Resolve provider override: supports both a single MusicProvider (legacy)
    // and a Record<MusicProviderId, MusicProvider> map (unified executor)
    let override: MusicProvider | undefined;
    if (providerOverrides) {
      if (typeof (providerOverrides as MusicProvider).addTracks === 'function') {
        // Legacy: single provider override for target only
        override = providerId === plan.targetProvider ? (providerOverrides as MusicProvider) : undefined;
      } else {
        override = (providerOverrides as Partial<Record<MusicProviderId, MusicProvider>>)[providerId];
      }
    }
    const desiredOrder = plan.targetOrder?.[providerId];
    const result = await applySide(items, providerId, playlistId, desiredOrder, override);

    totalAdded += result.added;
    totalRemoved += result.removed;
    allUnresolved.push(...result.unresolved);
    allErrors.push(...result.errors);
  }

  const unresolvedDetails: UnresolvedTrackInfo[] = allUnresolved.map((entry) => {
    const diffItem = plan.items.find((i) => i.canonicalTrackId === entry.canonicalTrackId);
    return {
      canonicalTrackId: entry.canonicalTrackId,
      title: diffItem?.title ?? '',
      artists: diffItem?.artists ?? [],
      durationMs: diffItem?.durationMs ?? 0,
      reason: entry.reason,
    };
  });

  console.debug('[sync/apply] sync plan applied', {
    added: totalAdded,
    removed: totalRemoved,
    unresolved: unresolvedDetails.length,
    errors: allErrors.length,
  });

  return {
    added: totalAdded,
    removed: totalRemoved,
    unresolved: unresolvedDetails,
    errors: allErrors,
  };
}
