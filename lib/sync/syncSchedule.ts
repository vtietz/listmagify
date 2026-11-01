/**
 * When sync pairs run next.
 *
 * Fixed intervals run at their period. `smart` pairs walk a ladder of waits:
 * back to the shortest wait after a run that found changes, one step longer
 * after every run that found nothing changed, so idle playlists are checked
 * rarely and active ones often. Editing a playlist of a smart pair in
 * Listmagify syncs it shortly after the last edit.
 */
import { getRecsDb } from '@/lib/recs/db';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { FixedSyncInterval, SyncInterval } from './types';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const FIXED_INTERVAL_MS: Record<FixedSyncInterval, number> = {
  '15m': 15 * MINUTE,
  '30m': 30 * MINUTE,
  '1h': HOUR,
  '6h': 6 * HOUR,
  '12h': 12 * HOUR,
  '24h': DAY,
  '3d': 3 * DAY,
  '7d': 7 * DAY,
};

/** Waits of a smart pair, from "just changed" to "unchanged for days". */
export const SMART_STEPS_MS: readonly number[] = [
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  3 * DAY,
  7 * DAY,
];

/** A smart pair runs this long after the last edit of one of its playlists in Listmagify. */
export const EDIT_DEBOUNCE_MS = 2 * MINUTE;

/** What a run found: changes on either side since the last sync, or none. */
export type SyncActivity = 'changed' | 'unchanged';

/** The smart step after a run; without an activity (failure, hold) the step stays. */
export function nextSmartStep(step: number, activity?: SyncActivity): number {
  if (activity === 'changed') return 0;
  const last = SMART_STEPS_MS.length - 1;
  const current = Math.min(Math.max(0, Math.floor(step)), last);
  return activity === 'unchanged' ? Math.min(current + 1, last) : current;
}

export function intervalMs(interval: SyncInterval, smartStep = 0): number {
  if (interval === 'off') return 0;
  if (interval === 'smart') return SMART_STEPS_MS[nextSmartStep(smartStep)]!;
  return FIXED_INTERVAL_MS[interval] ?? 0;
}

/** Next run time with ±10% jitter, so pairs created together do not run together. */
export function computeNextRunAt(interval: SyncInterval, smartStep = 0): string | null {
  const ms = intervalMs(interval, smartStep);
  if (!ms) return null;

  const jitter = ms * 0.10 * (2 * Math.random() - 1);
  return new Date(Date.now() + Math.round(ms + jitter)).toISOString();
}

export function backfillMissingNextRunAt(): void {
  const db = getRecsDb();
  const rows = db.prepare(`
    SELECT id, sync_interval AS syncInterval, smart_step AS smartStep
    FROM sync_pairs
    WHERE sync_interval != 'off' AND next_run_at IS NULL
  `).all() as Array<{ id: string; syncInterval: SyncInterval; smartStep: number }>;

  if (rows.length === 0) return;

  const update = db.prepare(`
    UPDATE sync_pairs
    SET next_run_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  for (const row of rows) {
    const nextRunAt = computeNextRunAt(row.syncInterval, row.smartStep);
    if (!nextRunAt) continue;
    update.run(nextRunAt, row.id);
  }
}

/**
 * Schedules the pair's next run after a run finished. `activity` moves a smart
 * pair along its ladder; fixed intervals ignore it.
 */
export function advanceNextRunAt(id: string, activity?: SyncActivity): void {
  const db = getRecsDb();

  const row = db.prepare('SELECT sync_interval AS syncInterval, smart_step AS smartStep FROM sync_pairs WHERE id = ?')
    .get(id) as { syncInterval: SyncInterval; smartStep: number } | undefined;

  if (!row || row.syncInterval === 'off') return;

  const smartStep = row.syncInterval === 'smart' ? nextSmartStep(row.smartStep, activity) : row.smartStep;
  const nextRunAt = computeNextRunAt(row.syncInterval, smartStep);
  if (!nextRunAt) return;

  db.prepare('UPDATE sync_pairs SET next_run_at = ?, smart_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(nextRunAt, smartStep, id);
}

export function setNextRunAtFromNow(id: string, delayMs: number): void {
  const db = getRecsDb();
  const safeDelayMs = Math.max(1000, Math.floor(delayMs));
  const nextRunAt = new Date(Date.now() + safeDelayMs).toISOString();
  db.prepare('UPDATE sync_pairs SET next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nextRunAt, id);
}

/**
 * A playlist was edited in Listmagify: smart pairs containing it run shortly
 * after the last edit (each edit pushes the run back) at the shortest wait.
 * Returns the number of pairs rescheduled.
 */
export function scheduleSmartPairsAfterEdit(providerId: MusicProviderId, playlistId: string): number {
  const db = getRecsDb();
  const nextRunAt = new Date(Date.now() + EDIT_DEBOUNCE_MS).toISOString();
  const result = db.prepare(`
    UPDATE sync_pairs
    SET next_run_at = ?, smart_step = 0, updated_at = CURRENT_TIMESTAMP
    WHERE sync_interval = 'smart'
      AND ((source_provider = ? AND source_playlist_id = ?)
        OR (target_provider = ? AND target_playlist_id = ?))
  `).run(nextRunAt, providerId, playlistId, providerId, playlistId);
  return result.changes;
}

/** Route-facing wrapper: a scheduling hiccup must never fail the user's edit. */
export function noteSmartSyncPlaylistEdited(providerId: MusicProviderId, playlistId: string): void {
  try {
    scheduleSmartPairsAfterEdit(providerId, playlistId);
  } catch (error) {
    console.warn('[sync/schedule] could not reschedule smart pairs after edit', { providerId, playlistId, error });
  }
}
