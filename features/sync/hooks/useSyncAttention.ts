'use client';

import { useMemo } from 'react';
import { useSyncPairs, type SyncPairWithRun } from './useSyncPairs';

function hasAuthError(pair: SyncPairWithRun): boolean {
  const msg = pair.latestRun?.errorMessage;
  if (!msg) return false;

  return (
    msg.includes('No valid session') ||
    msg.includes('invalid_grant') ||
    msg.includes('revoked')
  );
}

/**
 * Returns the number of sync pairs that need user attention due to
 * authentication failures (expired/revoked tokens).
 *
 * Used to show a warning badge on the Sync nav button.
 */
export function useSyncAttention(enabled = true) {
  const { data: pairs } = useSyncPairs(enabled);

  const attentionCount = useMemo(() => {
    if (!pairs) return 0;
    return pairs.filter(
      (p: SyncPairWithRun) => p.consecutiveFailures > 0 && hasAuthError(p),
    ).length;
  }, [pairs]);

  return { attentionCount };
}
