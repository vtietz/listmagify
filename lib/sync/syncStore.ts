import { randomUUID } from 'crypto';
import { getRecsDb } from '@/lib/recs/db';
import type { SyncPair, SyncRun, SyncDirection, SyncRunStatus, SyncInterval, SyncTrigger, SyncWarning } from './types';
import type { MusicProviderId } from '@/lib/music-provider/types';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const INTERVAL_MS: Record<SyncInterval, number> = {
  'off': 0,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

// -----------------------------------------------------------------------------
// SyncRun row mapper
// -----------------------------------------------------------------------------

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
      // corrupted JSON — treat as empty
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

// -----------------------------------------------------------------------------
// SyncPair CRUD
// -----------------------------------------------------------------------------

export function createSyncPair(input: {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  sourcePlaylistName: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
  targetPlaylistName: string;
  direction: SyncDirection;
  createdBy: string;
}): SyncPair {
  const db = getRecsDb();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO sync_pairs (
      id,
      source_provider,
      source_playlist_id,
      source_playlist_name,
      target_provider,
      target_playlist_id,
      target_playlist_name,
      direction,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.sourceProvider,
    input.sourcePlaylistId,
    input.sourcePlaylistName,
    input.targetProvider,
    input.targetPlaylistId,
    input.targetPlaylistName,
    input.direction,
    input.createdBy,
  );

  return getSyncPair(id)!;
}

export function getSyncPair(id: string, createdBy?: string): SyncPair | null {
  const db = getRecsDb();

  if (createdBy) {
    const row = db.prepare(`
      SELECT
        id,
        source_provider AS sourceProvider,
        source_playlist_id AS sourcePlaylistId,
        source_playlist_name AS sourcePlaylistName,
        target_provider AS targetProvider,
        target_playlist_id AS targetPlaylistId,
        target_playlist_name AS targetPlaylistName,
        direction,
        created_by AS createdBy,
        auto_sync AS autoSync,
        sync_interval AS syncInterval,
        next_run_at AS nextRunAt,
        consecutive_failures AS consecutiveFailures,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sync_pairs
      WHERE id = ? AND created_by = ?
    `).get(id, createdBy) as SyncPair | undefined;

    return row ?? null;
  }

  const row = db.prepare(`
    SELECT
      id,
      source_provider AS sourceProvider,
      source_playlist_id AS sourcePlaylistId,
      source_playlist_name AS sourcePlaylistName,
      target_provider AS targetProvider,
      target_playlist_id AS targetPlaylistId,
      target_playlist_name AS targetPlaylistName,
      direction,
      created_by AS createdBy,
      auto_sync AS autoSync,
      sync_interval AS syncInterval,
      next_run_at AS nextRunAt,
      consecutive_failures AS consecutiveFailures,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sync_pairs
    WHERE id = ?
  `).get(id) as SyncPair | undefined;

  return row ?? null;
}

export function getSyncPairByPlaylists(
  sourceProvider: MusicProviderId,
  sourcePlaylistId: string,
  targetProvider: MusicProviderId,
  targetPlaylistId: string,
  createdBy: string,
): SyncPair | null {
  const db = getRecsDb();

  const row = db.prepare(`
    SELECT
      id,
      source_provider AS sourceProvider,
      source_playlist_id AS sourcePlaylistId,
      source_playlist_name AS sourcePlaylistName,
      target_provider AS targetProvider,
      target_playlist_id AS targetPlaylistId,
      target_playlist_name AS targetPlaylistName,
      direction,
      created_by AS createdBy,
      auto_sync AS autoSync,
      sync_interval AS syncInterval,
      next_run_at AS nextRunAt,
      consecutive_failures AS consecutiveFailures,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sync_pairs
    WHERE source_provider = ?
      AND source_playlist_id = ?
      AND target_provider = ?
      AND target_playlist_id = ?
      AND created_by = ?
  `).get(
    sourceProvider,
    sourcePlaylistId,
    targetProvider,
    targetPlaylistId,
    createdBy,
  ) as SyncPair | undefined;

  return row ?? null;
}

export function listSyncPairs(createdBy: string): SyncPair[] {
  const db = getRecsDb();

  return db.prepare(`
    SELECT
      id,
      source_provider AS sourceProvider,
      source_playlist_id AS sourcePlaylistId,
      source_playlist_name AS sourcePlaylistName,
      target_provider AS targetProvider,
      target_playlist_id AS targetPlaylistId,
      target_playlist_name AS targetPlaylistName,
      direction,
      created_by AS createdBy,
      auto_sync AS autoSync,
      sync_interval AS syncInterval,
      next_run_at AS nextRunAt,
      consecutive_failures AS consecutiveFailures,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sync_pairs
    WHERE created_by = ?
    ORDER BY created_at DESC
  `).all(createdBy) as SyncPair[];
}

export function listSyncPairsForPlaylist(
  providerId: MusicProviderId,
  playlistId: string,
  createdBy: string,
): SyncPair[] {
  const db = getRecsDb();

  return db.prepare(`
    SELECT
      id,
      source_provider AS sourceProvider,
      source_playlist_id AS sourcePlaylistId,
      source_playlist_name AS sourcePlaylistName,
      target_provider AS targetProvider,
      target_playlist_id AS targetPlaylistId,
      target_playlist_name AS targetPlaylistName,
      direction,
      created_by AS createdBy,
      auto_sync AS autoSync,
      sync_interval AS syncInterval,
      next_run_at AS nextRunAt,
      consecutive_failures AS consecutiveFailures,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sync_pairs
    WHERE created_by = ?
      AND (
        (source_provider = ? AND source_playlist_id = ?)
        OR (target_provider = ? AND target_playlist_id = ?)
      )
    ORDER BY created_at DESC
  `).all(createdBy, providerId, playlistId, providerId, playlistId) as SyncPair[];
}

export function deleteSyncPairsForPlaylist(
  providerId: MusicProviderId,
  playlistId: string,
  createdBy: string,
): number {
  const db = getRecsDb();

  const result = db.prepare(`
    DELETE FROM sync_pairs
    WHERE created_by = ?
      AND (
        (source_provider = ? AND source_playlist_id = ?)
        OR (target_provider = ? AND target_playlist_id = ?)
      )
  `).run(createdBy, providerId, playlistId, providerId, playlistId);

  return result.changes;
}

export function deleteSyncPair(id: string, createdBy?: string): boolean {
  const db = getRecsDb();

  if (createdBy) {
    const result = db.prepare('DELETE FROM sync_pairs WHERE id = ? AND created_by = ?').run(id, createdBy);
    return result.changes > 0;
  }

  const result = db.prepare('DELETE FROM sync_pairs WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateSyncPairAutoSync(id: string, autoSync: boolean, createdBy?: string): boolean {
  const db = getRecsDb();
  const value = autoSync ? 1 : 0;

  if (createdBy) {
    const result = db.prepare(
      'UPDATE sync_pairs SET auto_sync = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?',
    ).run(value, id, createdBy);
    return result.changes > 0;
  }

  const result = db.prepare(
    'UPDATE sync_pairs SET auto_sync = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).run(value, id);
  return result.changes > 0;
}

// -----------------------------------------------------------------------------
// SyncPair scheduler helpers
// -----------------------------------------------------------------------------

export function updateSyncPairInterval(id: string, interval: SyncInterval, createdBy?: string): boolean {
  const db = getRecsDb();

  const baseMs = INTERVAL_MS[interval];
  const jitter = baseMs * 0.10 * (2 * Math.random() - 1);
  const nextRunAt = interval === 'off'
    ? null
    : new Date(Date.now() + Math.round(baseMs + jitter)).toISOString();

  if (createdBy) {
    const result = db.prepare(`
      UPDATE sync_pairs
      SET sync_interval = ?, next_run_at = ?, consecutive_failures = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND created_by = ?
    `).run(interval, nextRunAt, id, createdBy);
    return result.changes > 0;
  }

  const result = db.prepare(`
    UPDATE sync_pairs
    SET sync_interval = ?, next_run_at = ?, consecutive_failures = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(interval, nextRunAt, id);
  return result.changes > 0;
}

export function getDueSyncPairs(limit: number): SyncPair[] {
  const db = getRecsDb();

  return db.prepare(`
    SELECT
      id,
      source_provider AS sourceProvider,
      source_playlist_id AS sourcePlaylistId,
      source_playlist_name AS sourcePlaylistName,
      target_provider AS targetProvider,
      target_playlist_id AS targetPlaylistId,
      target_playlist_name AS targetPlaylistName,
      direction,
      created_by AS createdBy,
      auto_sync AS autoSync,
      sync_interval AS syncInterval,
      next_run_at AS nextRunAt,
      consecutive_failures AS consecutiveFailures,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sync_pairs
    WHERE sync_interval != 'off'
      AND next_run_at IS NOT NULL
      AND next_run_at <= datetime('now')
      AND consecutive_failures < 5
    ORDER BY next_run_at ASC
    LIMIT ?
  `).all(limit) as SyncPair[];
}

export function advanceNextRunAt(id: string): void {
  const db = getRecsDb();

  const row = db.prepare('SELECT sync_interval FROM sync_pairs WHERE id = ?').get(id) as
    | { sync_interval: SyncInterval }
    | undefined;

  if (!row || row.sync_interval === 'off') return;

  const ms = INTERVAL_MS[row.sync_interval];
  if (ms === 0) return;

  const jitter = ms * 0.10 * (2 * Math.random() - 1);
  const nextRunAt = new Date(Date.now() + Math.round(ms + jitter)).toISOString();
  db.prepare('UPDATE sync_pairs SET next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nextRunAt, id);
}

export function incrementConsecutiveFailures(id: string): void {
  const db = getRecsDb();
  db.prepare(
    'UPDATE sync_pairs SET consecutive_failures = consecutive_failures + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).run(id);
}

export function resetConsecutiveFailures(id: string): void {
  const db = getRecsDb();
  db.prepare(
    'UPDATE sync_pairs SET consecutive_failures = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).run(id);
}

// -----------------------------------------------------------------------------
// SyncRun CRUD
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Admin queries
// -----------------------------------------------------------------------------

export function getAllSyncPairsWithLatestRun(): Array<SyncPair & { latestRun: SyncRun | null }> {
  const db = getRecsDb();

  const pairs = db.prepare(`
    SELECT
      id, source_provider AS sourceProvider, source_playlist_id AS sourcePlaylistId,
      source_playlist_name AS sourcePlaylistName, target_provider AS targetProvider,
      target_playlist_id AS targetPlaylistId, target_playlist_name AS targetPlaylistName,
      direction, created_by AS createdBy, auto_sync AS autoSync,
      sync_interval AS syncInterval, next_run_at AS nextRunAt,
      consecutive_failures AS consecutiveFailures,
      created_at AS createdAt, updated_at AS updatedAt
    FROM sync_pairs
    ORDER BY updated_at DESC
  `).all() as SyncPair[];

  // For each pair, fetch the latest run
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
