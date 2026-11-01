'use client';

import { useMemo } from 'react';
import { useSyncPairs, type SyncPairWithRun } from './useSyncPairs';
import { SYNC_HELD_FOR_REVIEW_PREFIX } from '@/lib/sync/types';

function hasAuthError(pair: SyncPairWithRun): boolean {
  const msg = pair.latestRun?.errorMessage;
  if (!msg) return false;

  return (
    msg.includes('No valid session') ||
    msg.includes('invalid_grant') ||
    msg.includes('revoked')
  );
}

/** The latest run was held because it would remove most of a playlist. */
function isHeldForReview(pair: SyncPairWithRun): boolean {
  return pair.latestRun?.errorMessage?.startsWith(SYNC_HELD_FOR_REVIEW_PREFIX) ?? false;
}

function needsAttention(pair: SyncPairWithRun): boolean {
  return (pair.consecutiveFailures > 0 && hasAuthError(pair)) || isHeldForReview(pair);
}

/**
 * Returns the number of sync pairs that need user attention: authentication
 * failures (expired/revoked tokens) or runs held for review.
 *
 * Used to show a warning badge on the Sync nav button.
 */
export function useSyncAttention(enabled = true) {
  // Header badges can refresh less aggressively than management UI polling.
  const { data: pairs } = useSyncPairs(enabled, { refetchIntervalMs: 60_000 });

  const attentionCount = useMemo(() => {
    if (!pairs) return 0;
    return pairs.filter(needsAttention).length;
  }, [pairs]);

  return { attentionCount };
}
