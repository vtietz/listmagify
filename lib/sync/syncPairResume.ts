import { getRecsDb } from '@/lib/recs/db';
import { ownershipCondition } from './syncStore';

/**
 * Re-enable scheduled pairs of a user after they signed in again.
 * Clears the failure counter (pairs with 5+ failures are no longer picked up
 * by the scheduler) and makes them due immediately.
 */
export function resumeFailedSyncPairsForUser(userId: string): number {
  const db = getRecsDb();
  const ownership = ownershipCondition([userId]);
  const result = db.prepare(`
    UPDATE sync_pairs
    SET consecutive_failures = 0, next_run_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE consecutive_failures > 0
      AND sync_interval != 'off'
      AND ${ownership.sql}
  `).run(new Date().toISOString(), ...ownership.params);

  return result.changes;
}
