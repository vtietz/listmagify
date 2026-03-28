import { randomUUID } from 'crypto';
import { getRecsDb } from '@/lib/recs/db';
import type { SyncPair, SyncRun, SyncDirection, SyncRunStatus } from './types';
import type { MusicProviderId } from '@/lib/music-provider/types';

// -----------------------------------------------------------------------------
// SyncPair CRUD
// -----------------------------------------------------------------------------

export function createSyncPair(input: {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
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
      target_provider,
      target_playlist_id,
      direction,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.sourceProvider,
    input.sourcePlaylistId,
    input.targetProvider,
    input.targetPlaylistId,
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
        target_provider AS targetProvider,
        target_playlist_id AS targetPlaylistId,
        direction,
        created_by AS createdBy,
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
      target_provider AS targetProvider,
      target_playlist_id AS targetPlaylistId,
      direction,
      created_by AS createdBy,
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
      target_provider AS targetProvider,
      target_playlist_id AS targetPlaylistId,
      direction,
      created_by AS createdBy,
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
      target_provider AS targetProvider,
      target_playlist_id AS targetPlaylistId,
      direction,
      created_by AS createdBy,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sync_pairs
    WHERE created_by = ?
    ORDER BY created_at DESC
  `).all(createdBy) as SyncPair[];
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

// -----------------------------------------------------------------------------
// SyncRun CRUD
// -----------------------------------------------------------------------------

export function createSyncRun(input: {
  syncPairId: string;
  direction: SyncDirection;
}): SyncRun {
  const db = getRecsDb();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO sync_runs (
      id,
      sync_pair_id,
      status,
      direction
    ) VALUES (?, ?, 'pending', ?)
  `).run(id, input.syncPairId, input.direction);

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
      started_at AS startedAt,
      completed_at AS completedAt
    FROM sync_runs
    WHERE sync_pair_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).get(syncPairId) as SyncRun | undefined;

  return row ?? null;
}
