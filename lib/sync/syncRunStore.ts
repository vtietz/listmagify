import { randomUUID } from 'crypto';
import { getRecsDb } from '@/lib/recs/db';
import type { SyncDirection, SyncRun, SyncRunStatus, SyncTrigger, SyncWarning } from '@/lib/sync/types';

interface SyncRunRow {
  id: string;
  syncPairId: string;
  status: SyncRunStatus;
  direction: SyncDirection;
  tracksAdded: number;
  tracksRemoved: number;
  tracksUnresolved: number;
  errorMessage: string | null;
  warningsJson: string | null;
  triggeredBy: SyncTrigger;
  startedAt: string;
  completedAt: string | null;
}

function mapSyncRunRow(row: SyncRunRow): SyncRun {
  let warnings: SyncWarning[] = [];
  if (row.warningsJson) {
    try {
      warnings = JSON.parse(row.warningsJson) as SyncWarning[];
    } catch {
      // corrupted JSON - treat as empty
    }
  }

  return {
    id: row.id,
    syncPairId: row.syncPairId,
    status: row.status,
    direction: row.direction,
    tracksAdded: row.tracksAdded,
    tracksRemoved: row.tracksRemoved,
    tracksUnresolved: row.tracksUnresolved,
    errorMessage: row.errorMessage,
    warnings,
    triggeredBy: row.triggeredBy,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

export function createSyncRun(input: {
  syncPairId: string;
  direction: SyncDirection;
  triggeredBy?: SyncTrigger;
}): SyncRun {
  const db = getRecsDb();
  const id = randomUUID();
  const triggeredBy = input.triggeredBy ?? 'manual';

  db.prepare(`
    INSERT INTO sync_runs (
      id,
      sync_pair_id,
      status,
      direction,
      triggered_by
    ) VALUES (?, ?, 'pending', ?, ?)
  `).run(id, input.syncPairId, input.direction, triggeredBy);

  return getLatestSyncRun(input.syncPairId)!;
}

export function updateSyncRun(
  id: string,
  update: {
    status?: SyncRunStatus;
    tracksAdded?: number;
    tracksRemoved?: number;
    tracksUnresolved?: number;
    errorMessage?: string | null;
    warningsJson?: string | null;
    completedAt?: string | null;
  },
): void {
  const db = getRecsDb();

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (update.status !== undefined) {
    setClauses.push('status = ?');
    params.push(update.status);
  }
  if (update.tracksAdded !== undefined) {
    setClauses.push('tracks_added = ?');
    params.push(update.tracksAdded);
  }
  if (update.tracksRemoved !== undefined) {
    setClauses.push('tracks_removed = ?');
    params.push(update.tracksRemoved);
  }
  if (update.tracksUnresolved !== undefined) {
    setClauses.push('tracks_unresolved = ?');
    params.push(update.tracksUnresolved);
  }
  if (update.errorMessage !== undefined) {
    setClauses.push('error_message = ?');
    params.push(update.errorMessage);
  }
  if (update.warningsJson !== undefined) {
    setClauses.push('warnings_json = ?');
    params.push(update.warningsJson);
  }
  if (update.completedAt !== undefined) {
    setClauses.push('completed_at = ?');
    params.push(update.completedAt);
  }

  if (setClauses.length === 0) {
    return;
  }

  params.push(id);
  db.prepare(`UPDATE sync_runs SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
}

export function getLatestSyncRun(syncPairId: string): SyncRun | null {
  const db = getRecsDb();

  const row = db.prepare(`
    SELECT
      id,
      sync_pair_id AS syncPairId,
      status,
      direction,
      tracks_added AS tracksAdded,
      tracks_removed AS tracksRemoved,
      tracks_unresolved AS tracksUnresolved,
      error_message AS errorMessage,
      warnings_json AS warningsJson,
      triggered_by AS triggeredBy,
      started_at AS startedAt,
      completed_at AS completedAt
    FROM sync_runs
    WHERE sync_pair_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).get(syncPairId) as SyncRunRow | undefined;

  return row ? mapSyncRunRow(row) : null;
}

export function listSyncRunsForPair(syncPairId: string, limit = 20): SyncRun[] {
  const db = getRecsDb();

  const rows = db.prepare(`
    SELECT
      id,
      sync_pair_id AS syncPairId,
      status,
      direction,
      tracks_added AS tracksAdded,
      tracks_removed AS tracksRemoved,
      tracks_unresolved AS tracksUnresolved,
      error_message AS errorMessage,
      warnings_json AS warningsJson,
      triggered_by AS triggeredBy,
      started_at AS startedAt,
      completed_at AS completedAt
    FROM sync_runs
    WHERE sync_pair_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(syncPairId, limit) as SyncRunRow[];

  return rows.map(mapSyncRunRow);
}

export function getAllSyncPairsWithLatestRun<T extends { id: string }>(pairs: T[]): Array<T & { latestRun: SyncRun | null }> {
  const db = getRecsDb();

  const latestRunStmt = db.prepare(`
    SELECT
      id, sync_pair_id AS syncPairId, status, direction,
      tracks_added AS tracksAdded, tracks_removed AS tracksRemoved,
      tracks_unresolved AS tracksUnresolved, error_message AS errorMessage,
      warnings_json AS warningsJson, triggered_by AS triggeredBy,
      started_at AS startedAt, completed_at AS completedAt
    FROM sync_runs
    WHERE sync_pair_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `);

  return pairs.map((pair) => {
    const runRow = latestRunStmt.get(pair.id) as SyncRunRow | undefined;
    return {
      ...pair,
      latestRun: runRow ? mapSyncRunRow(runRow) : null,
    };
  });
}

/**
 * Mark sync runs stuck in 'pending' or 'executing' for longer than
 * maxAgeMs as 'failed'. Returns the number of runs reset.
 */
export function resetStaleSyncRuns(maxAgeMs: number): number {
  const db = getRecsDb();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

  const result = db.prepare(`
    UPDATE sync_runs
    SET status = 'failed',
        error_message = 'Timed out (stuck in ' || status || ' state)',
        completed_at = datetime('now')
    WHERE status IN ('pending', 'executing')
      AND started_at < ?
  `).run(cutoff);

  if (result.changes > 0) {
    console.debug(`[sync/store] reset ${result.changes} stale sync run(s)`);
  }

  return result.changes;
}

export function pruneOldSyncRuns(keepPerPair: number): number {
  const db = getRecsDb();

  const result = db.prepare(`
    DELETE FROM sync_runs
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY sync_pair_id ORDER BY started_at DESC) AS rn
        FROM sync_runs
      ) WHERE rn > ?
    )
  `).run(keepPerPair);

  return result.changes;
}
