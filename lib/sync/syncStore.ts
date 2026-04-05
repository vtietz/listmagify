import { randomUUID } from 'crypto';
import { getRecsDb } from '@/lib/recs/db';
import type { SyncPair, SyncRun, SyncDirection, SyncInterval } from './types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import {
  createSyncRun,
  updateSyncRun,
  getLatestSyncRun,
  listSyncRunsForPair,
  getAllSyncPairsWithLatestRun as attachLatestRuns,
  resetStaleSyncRuns,
  pruneOldSyncRuns,
} from '@/lib/sync/syncRunStore';

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

interface PairMissingNextRunRow {
  id: string;
  syncInterval: SyncInterval;
}

function computeNextRunAt(interval: SyncInterval): string | null {
  if (interval === 'off') return null;

  const ms = INTERVAL_MS[interval];
  if (!ms) return null;

  const jitter = ms * 0.10 * (2 * Math.random() - 1);
  return new Date(Date.now() + Math.round(ms + jitter)).toISOString();
}

function backfillMissingNextRunAt(): void {
  const db = getRecsDb();
  const rows = db.prepare(`
    SELECT id, sync_interval AS syncInterval
    FROM sync_pairs
    WHERE sync_interval != 'off' AND next_run_at IS NULL
  `).all() as PairMissingNextRunRow[];

  if (rows.length === 0) return;

  const update = db.prepare(`
    UPDATE sync_pairs
    SET next_run_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  for (const row of rows) {
    const nextRunAt = computeNextRunAt(row.syncInterval);
    if (!nextRunAt) continue;
    update.run(nextRunAt, row.id);
  }
}

// -----------------------------------------------------------------------------
// SyncPair row mapper
// -----------------------------------------------------------------------------

interface SyncPairRow {
  id: string;
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  sourcePlaylistName: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
  targetPlaylistName: string;
  direction: SyncDirection;
  createdBy: string;
  providerUserIdsJson: string | null;
  autoSync: boolean;
  syncInterval: SyncInterval;
  nextRunAt: string | null;
  consecutiveFailures: number;
  sourceSnapshotId: string | null;
  targetSnapshotId: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapSyncPairRow(row: SyncPairRow): SyncPair {
  let providerUserIds: Record<string, string> = {};
  if (row.providerUserIdsJson) {
    try {
      providerUserIds = JSON.parse(row.providerUserIdsJson) as Record<string, string>;
    } catch {
      // corrupted JSON — treat as empty
    }
  }

  return {
    id: row.id,
    sourceProvider: row.sourceProvider,
    sourcePlaylistId: row.sourcePlaylistId,
    sourcePlaylistName: row.sourcePlaylistName,
    targetProvider: row.targetProvider,
    targetPlaylistId: row.targetPlaylistId,
    targetPlaylistName: row.targetPlaylistName,
    direction: row.direction,
    createdBy: row.createdBy,
    providerUserIds,
    autoSync: row.autoSync,
    syncInterval: row.syncInterval,
    nextRunAt: row.nextRunAt,
    consecutiveFailures: row.consecutiveFailures,
    sourceSnapshotId: row.sourceSnapshotId,
    targetSnapshotId: row.targetSnapshotId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Build a WHERE clause that matches sync pairs owned by any of the given userIds.
 * Checks both the legacy `created_by` column and the `provider_user_ids` JSON map.
 */
function ownershipCondition(userIds: string[]): { sql: string; params: string[] } {
  const createdByPlaceholders = userIds.map(() => '?').join(', ');
  const likeClauses = userIds.map(() => `provider_user_ids LIKE ?`).join(' OR ');
  const likeParams = userIds.map((id) => `%${id}%`);

  return {
    sql: `(created_by IN (${createdByPlaceholders}) OR ${likeClauses})`,
    params: [...userIds, ...likeParams],
  };
}

const SYNC_PAIR_COLUMNS = `
  id,
  source_provider AS sourceProvider,
  source_playlist_id AS sourcePlaylistId,
  source_playlist_name AS sourcePlaylistName,
  target_provider AS targetProvider,
  target_playlist_id AS targetPlaylistId,
  target_playlist_name AS targetPlaylistName,
  direction,
  created_by AS createdBy,
  provider_user_ids AS providerUserIdsJson,
  auto_sync AS autoSync,
  sync_interval AS syncInterval,
  next_run_at AS nextRunAt,
  consecutive_failures AS consecutiveFailures,
  source_snapshot_id AS sourceSnapshotId,
  target_snapshot_id AS targetSnapshotId,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

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
  providerUserIds: Record<string, string>;
  autoSync?: boolean;
  syncInterval?: SyncInterval;
}): SyncPair {
  const db = getRecsDb();
  const id = randomUUID();
  const syncInterval = input.syncInterval ?? 'off';
  const autoSync = input.autoSync ?? syncInterval !== 'off';
  const nextRunAt = syncInterval === 'off'
    ? null
    : new Date(Date.now() + INTERVAL_MS[syncInterval]).toISOString();

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
      created_by,
      provider_user_ids,
      auto_sync,
      sync_interval,
      next_run_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    JSON.stringify(input.providerUserIds),
    autoSync ? 1 : 0,
    syncInterval,
    nextRunAt,
  );

  return getSyncPair(id)!;
}

export function getSyncPair(id: string, createdBy?: string | string[]): SyncPair | null {
  const db = getRecsDb();

  if (createdBy) {
    const userIds = Array.isArray(createdBy) ? createdBy : [createdBy];
    if (userIds.length === 0) return null;
    const ownership = ownershipCondition(userIds);

    const row = db.prepare(`
      SELECT ${SYNC_PAIR_COLUMNS}
      FROM sync_pairs
      WHERE id = ? AND ${ownership.sql}
    `).get(id, ...ownership.params) as SyncPairRow | undefined;

    return row ? mapSyncPairRow(row) : null;
  }

  const row = db.prepare(`
    SELECT ${SYNC_PAIR_COLUMNS}
    FROM sync_pairs
    WHERE id = ?
  `).get(id) as SyncPairRow | undefined;

  return row ? mapSyncPairRow(row) : null;
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
    SELECT ${SYNC_PAIR_COLUMNS}
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
  ) as SyncPairRow | undefined;

  return row ? mapSyncPairRow(row) : null;
}

export function listSyncPairs(createdBy: string | string[]): SyncPair[] {
  backfillMissingNextRunAt();

  const db = getRecsDb();
  const userIds = Array.isArray(createdBy) ? createdBy : [createdBy];
  if (userIds.length === 0) return [];

  const ownership = ownershipCondition(userIds);

  const rows = db.prepare(`
    SELECT ${SYNC_PAIR_COLUMNS}
    FROM sync_pairs
    WHERE ${ownership.sql}
    ORDER BY created_at DESC
  `).all(...ownership.params) as SyncPairRow[];

  return rows.map(mapSyncPairRow);
}

export function listSyncPairsForPlaylist(
  providerId: MusicProviderId,
  playlistId: string,
  createdBy: string,
): SyncPair[] {
  const db = getRecsDb();

  const rows = db.prepare(`
    SELECT ${SYNC_PAIR_COLUMNS}
    FROM sync_pairs
    WHERE created_by = ?
      AND (
        (source_provider = ? AND source_playlist_id = ?)
        OR (target_provider = ? AND target_playlist_id = ?)
      )
    ORDER BY created_at DESC
  `).all(createdBy, providerId, playlistId, providerId, playlistId) as SyncPairRow[];

  return rows.map(mapSyncPairRow);
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

export function deleteSyncPair(id: string, createdBy?: string | string[]): boolean {
  const db = getRecsDb();

  if (createdBy) {
    const userIds = Array.isArray(createdBy) ? createdBy : [createdBy];
    if (userIds.length === 0) return false;
    const ownership = ownershipCondition(userIds);
    const result = db.prepare(`DELETE FROM sync_pairs WHERE id = ? AND ${ownership.sql}`).run(id, ...ownership.params);
    return result.changes > 0;
  }

  const result = db.prepare('DELETE FROM sync_pairs WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateSyncPairAutoSync(id: string, autoSync: boolean, createdBy?: string | string[]): boolean {
  const db = getRecsDb();
  const value = autoSync ? 1 : 0;

  if (createdBy) {
    const userIds = Array.isArray(createdBy) ? createdBy : [createdBy];
    if (userIds.length === 0) return false;
    const ownership = ownershipCondition(userIds);
    const result = db.prepare(
      `UPDATE sync_pairs SET auto_sync = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${ownership.sql}`,
    ).run(value, id, ...ownership.params);
    return result.changes > 0;
  }

  const result = db.prepare(
    'UPDATE sync_pairs SET auto_sync = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).run(value, id);
  return result.changes > 0;
}

export function updateSyncPairSnapshotIds(
  id: string,
  sourceSnapshotId: string | null,
  targetSnapshotId: string | null,
): void {
  const db = getRecsDb();
  db.prepare(`
    UPDATE sync_pairs
    SET source_snapshot_id = ?, target_snapshot_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(sourceSnapshotId, targetSnapshotId, id);
}

// -----------------------------------------------------------------------------
// SyncPair scheduler helpers
// -----------------------------------------------------------------------------

export function updateSyncPairInterval(id: string, interval: SyncInterval, createdBy?: string | string[]): boolean {
  const db = getRecsDb();

  const baseMs = INTERVAL_MS[interval];
  const jitter = baseMs * 0.10 * (2 * Math.random() - 1);
  const nextRunAt = interval === 'off'
    ? null
    : new Date(Date.now() + Math.round(baseMs + jitter)).toISOString();

  if (createdBy) {
    const userIds = Array.isArray(createdBy) ? createdBy : [createdBy];
    if (userIds.length === 0) return false;
    const ownership = ownershipCondition(userIds);
    const result = db.prepare(`
      UPDATE sync_pairs
      SET sync_interval = ?, next_run_at = ?, consecutive_failures = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND ${ownership.sql}
    `).run(interval, nextRunAt, id, ...ownership.params);
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
  backfillMissingNextRunAt();

  const db = getRecsDb();

  const rows = db.prepare(`
    SELECT ${SYNC_PAIR_COLUMNS}
    FROM sync_pairs
    WHERE sync_interval != 'off'
      AND next_run_at IS NOT NULL
      AND datetime(next_run_at) <= datetime('now')
      AND consecutive_failures < 5
    ORDER BY datetime(next_run_at) ASC
    LIMIT ?
  `).all(limit) as SyncPairRow[];

  return rows.map(mapSyncPairRow);
}

export function advanceNextRunAt(id: string): void {
  const db = getRecsDb();

  const row = db.prepare('SELECT sync_interval FROM sync_pairs WHERE id = ?').get(id) as
    | { sync_interval: SyncInterval }
    | undefined;

  if (!row || row.sync_interval === 'off') return;

  const ms = INTERVAL_MS[row.sync_interval];
  if (ms === 0) return;

  const nextRunAt = computeNextRunAt(row.sync_interval);
  if (!nextRunAt) return;
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

export function getAllSyncPairsWithLatestRun(): Array<SyncPair & { latestRun: SyncRun | null }> {
  const db = getRecsDb();

  const rows = db.prepare(`
    SELECT ${SYNC_PAIR_COLUMNS}
    FROM sync_pairs
    ORDER BY updated_at DESC
  `).all() as SyncPairRow[];

  const pairs = rows.map(mapSyncPairRow);
  return attachLatestRuns(pairs);
}

export {
  createSyncRun,
  updateSyncRun,
  getLatestSyncRun,
  listSyncRunsForPair,
  resetStaleSyncRuns,
  pruneOldSyncRuns,
};
