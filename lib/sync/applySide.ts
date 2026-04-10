import { getMusicProvider } from '@/lib/music-provider';
import { toProviderTrackId, toProviderTrackUri } from '@/lib/music-provider/trackCodec';
import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { materializeCanonicalTrackIds } from '@/lib/recs/materialize';
import type { SyncDiffItem, UnresolvedTrackInfo } from '@/lib/sync/types';
import { createSyncMaterializeAdapter } from '@/lib/sync/materializeAdapter';
import { isLikedSongsPlaylist } from '@/lib/sync/likedSongs';
import { applyBatchedLikedAdds, applyBatchedLikedRemoves } from '@/lib/sync/applyLikedTracks';
import { requiresLikedTracksVerification } from '@/lib/music-provider/capabilities';

const BATCH_SIZE = 100;

interface UnresolvedEntry {
  canonicalTrackId: string;
  reason: UnresolvedTrackInfo['reason'];
}

export interface SideResult {
  added: number;
  removed: number;
  unresolved: UnresolvedEntry[];
  errors: string[];
}

interface ResolveResult {
  uris: string[];
  unresolved: UnresolvedEntry[];
  errors: string[];
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
    return { uris: [], unresolved: [], errors: [] };
  }

  const preResolved = adds.filter((i) => i.resolvedTargetTrackId && i.materializeStatus === 'resolved');
  const preUnresolved = adds.filter((i) => i.materializeStatus === 'not_found');
  const needsResolution = adds.filter(
    (i) => !i.materializeStatus || i.materializeStatus === 'unchecked' || i.materializeStatus === 'timed_out',
  );

  const seenUris = new Set<string>();
  const uris: string[] = [];
  for (const item of preResolved) {
    const uri = toProviderTrackUri(targetProviderId, item.resolvedTargetTrackId!);
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

async function reorderPlaylist(
  provider: MusicProvider,
  providerId: MusicProviderId,
  playlistId: string,
  desiredCanonicalOrder: string[],
): Promise<void> {
  const currentUris = await provider.getPlaylistTrackUris(playlistId);
  if (currentUris.length <= 1) return;

  const { toProviderTrack } = await import('@/lib/resolver/canonicalResolver');

  const canonicalToUri = new Map<string, string>();
  const currentUriSet = new Set(currentUris);

  for (const canonicalId of desiredCanonicalOrder) {
    const mapping = toProviderTrack(providerId, canonicalId);
    if (!mapping) continue;

    const uri = toProviderTrackUri(providerId, mapping.providerTrackId);
    if (currentUriSet.has(uri)) {
      canonicalToUri.set(canonicalId, uri);
    }
  }

  const orderedUris: string[] = [];
  const placed = new Set<string>();

  for (const canonicalId of desiredCanonicalOrder) {
    const uri = canonicalToUri.get(canonicalId);
    if (uri && !placed.has(uri)) {
      orderedUris.push(uri);
      placed.add(uri);
    }
  }

  for (const uri of currentUris) {
    if (!placed.has(uri)) {
      orderedUris.push(uri);
      placed.add(uri);
    }
  }

  const unchanged = orderedUris.length === currentUris.length
    && orderedUris.every((uri, i) => uri === currentUris[i]);
  if (unchanged) {
    return;
  }

  console.debug('[sync/apply] reordering playlist', {
    provider: providerId,
    playlistId,
    trackCount: orderedUris.length,
  });

  await provider.replacePlaylistTracks(playlistId, orderedUris);
}

export async function applySide(
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
