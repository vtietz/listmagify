import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { applySide } from '@/lib/sync/applySide';
import type { SyncDiffItem, SyncPlan, SyncApplyResult, UnresolvedTrackInfo } from '@/lib/sync/types';

interface UnresolvedEntry {
  canonicalTrackId: string;
  reason: UnresolvedTrackInfo['reason'];
  targetProvider?: MusicProviderId;
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
  const addedKeys: NonNullable<SyncApplyResult['addedKeys']> = {};

  const targetOrderProviders = new Set(
    Object.keys(plan.targetOrder ?? {}) as MusicProviderId[],
  );
  const providersToApply = new Set<MusicProviderId>([
    ...itemsByProvider.keys(),
    ...targetOrderProviders,
  ]);

  for (const providerId of providersToApply) {
    const items = itemsByProvider.get(providerId) ?? [];
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
    const result = await applySide(items, providerId, playlistId, desiredOrder, override, plan.trackKeys?.[providerId]);

    addedKeys[providerId] = result.addedKeys;
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
      ...(entry.targetProvider ? { targetProvider: entry.targetProvider } : {}),
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
    addedKeys,
  };
}
