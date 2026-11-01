import { getMusicProvider } from '@/lib/music-provider';
import { toProviderTrackId, toProviderTrackUri } from '@/lib/music-provider/trackCodec';
import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { materializeCanonicalTrackIds } from '@/lib/recs/materialize';
import type { SyncDiffItem, UnresolvedTrackInfo } from '@/lib/sync/types';
import { createSyncMaterializeAdapter } from '@/lib/sync/materializeAdapter';
import { isLikedSongsPlaylist } from '@/lib/sync/likedSongs';
import { applyBatchedLikedAdds, applyBatchedLikedRemoves } from '@/lib/sync/applyLikedTracks';
import { requiresLikedTracksVerification, supportsInPlaceReorder } from '@/lib/music-provider/capabilities';
import { buildReorderedIndices, planReorderMoves } from '@/lib/sync/reorderMoves';

const BATCH_SIZE = 100;
/** Above this many moves a single replace is cheaper, at the cost of resetting "added at" dates. */
const MAX_REORDER_MOVES = 50;

interface UnresolvedEntry {
  canonicalTrackId: string;
  reason: UnresolvedTrackInfo['reason'];
  targetProvider?: MusicProviderId;
}

export interface SideResult {
  added: number;
  removed: number;
  unresolved: UnresolvedEntry[];
  errors: string[];
  /** providerTrackId -> sync key of the plan item it was resolved for */
  addedKeys: Record<string, string>;
}

interface ResolveResult {
  uris: string[];
  unresolved: UnresolvedEntry[];
  errors: string[];
  keyByTrackId: Record<string, string>;
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

async function resolveAddUris(
  adds: SyncDiffItem[],
  targetProvider: MusicProvider,
  targetProviderId: MusicProviderId,
): Promise<ResolveResult> {
  if (adds.length === 0) {
    return { uris: [], unresolved: [], errors: [], keyByTrackId: {} };
  }

  const preResolved = adds.filter((i) => i.resolvedTargetTrackId && i.materializeStatus === 'resolved');
  const preUnresolved = adds.filter((i) => i.materializeStatus === 'not_found');
  const needsResolution = adds.filter(
    (i) => !i.materializeStatus || i.materializeStatus === 'unchecked' || i.materializeStatus === 'timed_out',
  );

  const seenUris = new Set<string>();
  const uris: string[] = [];
  const keyByTrackId: Record<string, string> = {};
  for (const item of preResolved) {
    const uri = toProviderTrackUri(targetProviderId, item.resolvedTargetTrackId!);
    keyByTrackId[item.resolvedTargetTrackId!] ??= item.canonicalTrackId;
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

  if (needsResolution.length > 0) {
    const canonicalTrackIds = needsResolution.map((item) => item.canonicalTrackId);
    const adapter = createSyncMaterializeAdapter(targetProvider, targetProviderId);

    try {
      const result = await materializeCanonicalTrackIds({
        provider: targetProviderId,
        canonicalTrackIds,
        adapter,
      });

      uris.push(...result.trackIds.map((id) => toProviderTrackUri(targetProviderId, id)));
      // trackIds follow the order of the resolved canonical IDs
      const unresolvedIds = new Set(result.unresolvedCanonicalIds);
      const resolvedIds = canonicalTrackIds.filter((id) => !unresolvedIds.has(id));
      result.trackIds.forEach((trackId, index) => {
        const key = resolvedIds[index];
        if (key) keyByTrackId[trackId] ??= key;
      });
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

  return { uris, unresolved, errors, keyByTrackId };
}

function resolveRemoveUris(
  removes: SyncDiffItem[],
  targetProviderId: MusicProviderId,
): { uris: string[]; unresolved: UnresolvedEntry[] } {
  const uris: string[] = [];
  const unresolved: UnresolvedEntry[] = [];

  for (const item of removes) {
    if (item.providerTrackId) {
      uris.push(toProviderTrackUri(targetProviderId, item.providerTrackId));
    } else {
      unresolved.push({
        canonicalTrackId: item.canonicalTrackId,
        reason: 'no_provider_mapping',
      });
    }
  }

  return { uris, unresolved };
}

async function applyBatchedPlaylistAdds(
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

async function applyBatchedPlaylistRemoves(
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

async function filterAlreadyPresent(
  uris: string[],
  provider: MusicProvider,
  providerId: MusicProviderId,
  playlistId: string,
  isLiked: boolean,
): Promise<string[]> {
  if (uris.length === 0) return uris;

  // For providers that verify liked writes after saveTracks, skip pre-filtering
  // so we do not silently drop tracks due to stale/partial contains checks.
  if (isLiked && requiresLikedTracksVerification(providerId)) {
    return uris;
  }

  try {
    if (isLiked) {
      const ids = uris.map((uri) => toProviderTrackId(providerId, uri));
      const contains = await provider.containsTracks({ ids });
      const filtered = uris.filter((_, idx) => !contains[idx]);
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
      error: errorMessage(err),
    });
    return uris;
  }
}

/**
 * Sorts the playlist's current entries by the desired canonical order.
 *
 * Entries are mapped to canonical IDs from the URIs actually in the playlist, so a
 * track whose playlist entry is a different release than the preferred mapping is
 * still placed correctly. The sort is stable: duplicates stay together and entries
 * without a known position keep their relative order at the end. No entry is
 * dropped.
 */
export function buildReorderedUris(
  currentUris: string[],
  canonicalByUri: Map<string, string>,
  desiredCanonicalOrder: string[],
): string[] {
  const keys = currentUris.map((uri) => canonicalByUri.get(uri));
  return buildReorderedIndices(keys, desiredCanonicalOrder).map((index) => currentUris[index]!);
}

/**
 * Canonical ID (sync key) per URI: keys known to the sync (the pair's local copy
 * and tracks this run added) win over the provider-wide mapping.
 */
async function resolveCanonicalByUri(
  providerId: MusicProviderId,
  currentUris: string[],
  knownKeys: Record<string, string>,
): Promise<Map<string, string>> {
  const { lookupCanonicalTrackIds } = await import('@/lib/resolver/canonicalResolver');

  const providerTrackIds = currentUris.map((uri) => toProviderTrackId(providerId, uri));
  const unknownIds = Array.from(new Set(providerTrackIds.filter((id) => !knownKeys[id])));
  const canonicalById = lookupCanonicalTrackIds(providerId, unknownIds);

  const canonicalByUri = new Map<string, string>();
  currentUris.forEach((uri, index) => {
    const providerTrackId = providerTrackIds[index]!;
    const canonicalId = knownKeys[providerTrackId] ?? canonicalById.get(providerTrackId);
    if (canonicalId) canonicalByUri.set(uri, canonicalId);
  });
  return canonicalByUri;
}

/**
 * Moves address entries by index, so they are only safe when the URI list covers
 * every playlist entry (unavailable items and videos are left out of it).
 */
async function listsEveryPlaylistEntry(
  provider: MusicProvider,
  playlistId: string,
  uriCount: number,
): Promise<boolean> {
  const page = await provider.getPlaylistTracks(playlistId, 1, null);
  return page.total === uriCount;
}

async function reorderPlaylist(
  provider: MusicProvider,
  providerId: MusicProviderId,
  playlistId: string,
  desiredCanonicalOrder: string[],
  knownKeys: Record<string, string>,
): Promise<void> {
  const currentUris = await provider.getPlaylistTrackUris(playlistId);
  if (currentUris.length <= 1) return;

  const canonicalByUri = await resolveCanonicalByUri(providerId, currentUris, knownKeys);
  const desiredIndices = buildReorderedIndices(
    currentUris.map((uri) => canonicalByUri.get(uri)),
    desiredCanonicalOrder,
  );
  const moves = planReorderMoves(desiredIndices);
  if (moves.length === 0) {
    return;
  }

  if (
    supportsInPlaceReorder(providerId)
    && moves.length <= MAX_REORDER_MOVES
    && await listsEveryPlaylistEntry(provider, playlistId, currentUris.length)
  ) {
    console.debug('[sync/apply] reordering playlist in place', {
      provider: providerId,
      playlistId,
      moves: moves.length,
    });
    for (const move of moves) {
      await provider.reorderTracks({ playlistId, fromIndex: move.fromIndex, toIndex: move.toIndex });
    }
    return;
  }

  console.debug('[sync/apply] reordering playlist by replacing it', {
    provider: providerId,
    playlistId,
    trackCount: currentUris.length,
    moves: moves.length,
  });

  await provider.replacePlaylistTracks(playlistId, desiredIndices.map((index) => currentUris[index]!));
}

export async function applySide(
  items: SyncDiffItem[],
  providerId: MusicProviderId,
  playlistId: string,
  desiredOrder?: string[],
  providerOverride?: MusicProvider,
  trackKeys?: Record<string, string>,
): Promise<SideResult> {
  const provider = providerOverride ?? getMusicProvider(providerId);
  const isLiked = isLikedSongsPlaylist(playlistId);

  const adds = items.filter((i) => i.action === 'add');
  const removes = items.filter((i) => i.action === 'remove');

  const resolved = await resolveAddUris(adds, provider, providerId);
  const removeResolved = resolveRemoveUris(removes, providerId);

  const allUnresolved = [...resolved.unresolved, ...removeResolved.unresolved]
    .map((entry) => ({ ...entry, targetProvider: providerId }));
  const allErrors = [...resolved.errors];

  const addUris = await filterAlreadyPresent(resolved.uris, provider, providerId, playlistId, isLiked);

  if (addUris.length > 0) {
    console.debug('[sync/apply] applying additions', {
      provider: providerId,
      count: addUris.length,
      targetPlaylist: playlistId,
      isLiked,
    });
  }

  const addResult = isLiked
    ? await applyBatchedLikedAdds(addUris, provider, providerId)
    : await applyBatchedPlaylistAdds(addUris, provider, playlistId);
  allErrors.push(...addResult.errors);

  if (removeResolved.uris.length > 0) {
    console.debug('[sync/apply] applying removals', {
      provider: providerId,
      count: removeResolved.uris.length,
      targetPlaylist: playlistId,
      isLiked,
    });
  }

  const removeResult = isLiked
    ? await applyBatchedLikedRemoves(removeResolved.uris, provider, providerId)
    : await applyBatchedPlaylistRemoves(removeResolved.uris, provider, playlistId);
  allErrors.push(...removeResult.errors);

  if (!isLiked && desiredOrder && desiredOrder.length > 0) {
    try {
      await reorderPlaylist(provider, providerId, playlistId, desiredOrder, { ...trackKeys, ...resolved.keyByTrackId });
    } catch (err) {
      allErrors.push(`Reorder failed: ${errorMessage(err)}`);
    }
  }

  return {
    added: addResult.count,
    removed: removeResult.count,
    unresolved: allUnresolved,
    errors: allErrors,
    addedKeys: resolved.keyByTrackId,
  };
}
