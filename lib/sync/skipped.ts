import type { SyncPlan } from '@/lib/sync/types';

/**
 * Marks additions of tracks the user skipped for this pair. Skipped items are
 * neither searched for nor added, and are not counted as unresolved.
 */
export function markSkippedItems(plan: SyncPlan, skippedCanonicalIds: readonly string[] | undefined): void {
  if (!skippedCanonicalIds || skippedCanonicalIds.length === 0) return;

  const skipped = new Set(skippedCanonicalIds);
  for (const item of plan.items) {
    if (item.action === 'add' && skipped.has(item.canonicalTrackId)) {
      item.materializeStatus = 'skipped';
    }
  }
}
