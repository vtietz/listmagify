import { describe, expect, it } from 'vitest';
import type { SyncPlan } from '@/lib/sync/types';
import { markSkippedItems } from '@/lib/sync/skipped';

describe('markSkippedItems', () => {
  it('marks only additions of skipped tracks', () => {
    const plan = {
      items: [
        { canonicalTrackId: 'a', action: 'add' },
        { canonicalTrackId: 'b', action: 'add' },
        { canonicalTrackId: 'a', action: 'remove' },
      ],
    } as unknown as SyncPlan;

    markSkippedItems(plan, ['a']);

    expect(plan.items.map((item) => item.materializeStatus)).toEqual(['skipped', undefined, undefined]);
  });
});
