import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncDiffItem, SyncPlan } from '@/lib/sync/types';

/**
 * What the user decided for a track that could not be matched automatically:
 * - `matched`: a target track was picked by hand (and saved as a mapping)
 * - `skipped`: the track is left out of this pair's syncs
 * - `unskipped`: a previously skipped track is synced again
 */
export type ManualResolution =
  | { kind: 'matched'; providerTrackId: string; title: string; artists: string[] }
  | { kind: 'skipped' }
  | { kind: 'unskipped' };

export type ManualResolutions = Record<string, ManualResolution>;

export function resolutionKey(provider: MusicProviderId, canonicalTrackId: string): string {
  return `${provider}::${canonicalTrackId}`;
}

function applyResolution(item: SyncDiffItem, resolution: ManualResolution | undefined): SyncDiffItem {
  if (!resolution || item.action !== 'add') return item;

  switch (resolution.kind) {
    case 'matched':
      return {
        ...item,
        materializeStatus: 'resolved',
        resolvedTargetTrackId: resolution.providerTrackId,
        manualMatch: true,
      };
    case 'skipped':
      return { ...item, materializeStatus: 'skipped' };
    case 'unskipped':
      // Not searched during preview; resolved when the plan is applied.
      return { ...item, materializeStatus: 'unchecked' };
  }
}

function isUnresolved(item: SyncDiffItem): boolean {
  return item.action === 'add' && (item.materializeStatus === 'not_found' || item.materializeStatus === 'timed_out');
}

/** Returns a copy of the plan with the user's manual decisions applied. */
export function applyResolutionsToPlan(plan: SyncPlan, resolutions: ManualResolutions): SyncPlan {
  if (Object.keys(resolutions).length === 0) return plan;

  const items = plan.items.map((item) => (
    applyResolution(item, resolutions[resolutionKey(item.targetProvider, item.canonicalTrackId)])
  ));

  return {
    ...plan,
    items,
    summary: { ...plan.summary, unresolved: items.filter(isUnresolved).length },
  };
}
