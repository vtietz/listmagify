import { randomUUID } from 'crypto';
import { getRecsDb } from '@/lib/recs/db';
import type {
  ImportJob,
  ImportJobPlaylist,
  ImportJobWithPlaylists,
  CreateImportJobInput,
} from './types';

// -----------------------------------------------------------------------------
// ImportJob CRUD
// -----------------------------------------------------------------------------

export function createImportJob(input: CreateImportJobInput): ImportJob {
  const db = getRecsDb();
  const jobId = randomUUID();

  const insertJob = db.prepare(`
    INSERT INTO import_jobs (
      id,
      source_provider,
      target_provider,
      status,
      created_by,
      create_sync_pair,
      sync_interval
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?)
  `);

  const insertPlaylist = db.prepare(`
    INSERT INTO import_job_playlists (
      id,
      job_id,
      source_playlist_id,
      source_playlist_name,
      status,
      position
    ) VALUES (?, ?, ?, ?, 'queued', ?)
  `);

  const transaction = db.transaction(() => {
    insertJob.run(
      jobId,
      input.sourceProvider,
      input.targetProvider,
      input.createdBy,
      input.createSyncPair ? 1 : 0,
      input.syncInterval ?? 'off',
    );

    for (let i = 0; i < input.playlists.length; i++) {
      const playlist = input.playlists[i]!;
      insertPlaylist.run(randomUUID(), jobId, playlist.id, playlist.name, i);
    }
  });

  transaction();

  return getImportJob(jobId)!;
}

function getImportJob(jobId: string): ImportJob | null {
  const db = getRecsDb();

  const row = db.prepare(`
    SELECT
      id,
      source_provider AS sourceProvider,
      target_provider AS targetProvider,
      status,
      created_by AS createdBy,
      created_at AS createdAt,
      completed_at AS completedAt,
      create_sync_pair AS createSyncPair,
      sync_interval AS syncInterval
    FROM import_jobs
    WHERE id = ?
  `).get(jobId) as ImportJob | undefined;

  if (!row) return null;
  row.createSyncPair = Boolean(row.createSyncPair);
  return row;
}

export function getImportJobWithPlaylists(
  jobId: string,
  createdBy?: string | string[],
): ImportJobWithPlaylists | null {
  const db = getRecsDb();

  let job: ImportJob | undefined;

  if (createdBy) {
    const userIds = Array.isArray(createdBy) ? createdBy : [createdBy];
    if (userIds.length === 0) return null;
    const placeholders = userIds.map(() => '?').join(', ');
    job = db.prepare(`
        SELECT
          id,
          source_provider AS sourceProvider,
          target_provider AS targetProvider,
          status,
          created_by AS createdBy,
          created_at AS createdAt,
          completed_at AS completedAt,
          create_sync_pair AS createSyncPair,
          sync_interval AS syncInterval
        FROM import_jobs
        WHERE id = ? AND created_by IN (${placeholders})
      `).get(jobId, ...userIds) as ImportJob | undefined;
  } else {
    job = db.prepare(`
        SELECT
          id,
          source_provider AS sourceProvider,
          target_provider AS targetProvider,
          status,
          created_by AS createdBy,
          created_at AS createdAt,
          completed_at AS completedAt,
          create_sync_pair AS createSyncPair,
          sync_interval AS syncInterval
        FROM import_jobs
        WHERE id = ?
      `).get(jobId) as ImportJob | undefined;
  }
  if (!job) return null;
  job.createSyncPair = Boolean(job.createSyncPair);

  const playlists = db.prepare(`
    SELECT
      id,
      job_id AS jobId,
      source_playlist_id AS sourcePlaylistId,
      source_playlist_name AS sourcePlaylistName,
      target_playlist_id AS targetPlaylistId,
      status,
      track_count AS trackCount,
      tracks_resolved AS tracksResolved,
      tracks_added AS tracksAdded,
      tracks_unresolved AS tracksUnresolved,
      error_message AS errorMessage,
      position
    FROM import_job_playlists
    WHERE job_id = ?
    ORDER BY position ASC
  `).all(jobId) as ImportJobPlaylist[];

  const completedPlaylists = playlists.filter(
    (p) => p.status === 'done' || p.status === 'partial',
  ).length;

  return {
    ...job,
    playlists,
    totalPlaylists: playlists.length,
    completedPlaylists,
  };
}

export function updateImportJobPlaylist(
  id: string,
  update: Partial<ImportJobPlaylist>,
): void {
  const db = getRecsDb();

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (update.targetPlaylistId !== undefined) {
    setClauses.push('target_playlist_id = ?');
    params.push(update.targetPlaylistId);
  }
  if (update.status !== undefined) {
    setClauses.push('status = ?');
    params.push(update.status);
  }
  if (update.trackCount !== undefined) {
    setClauses.push('track_count = ?');
    params.push(update.trackCount);
  }
  if (update.tracksResolved !== undefined) {
    setClauses.push('tracks_resolved = ?');
    params.push(update.tracksResolved);
  }
  if (update.tracksAdded !== undefined) {
    setClauses.push('tracks_added = ?');
    params.push(update.tracksAdded);
  }
  if (update.tracksUnresolved !== undefined) {
    setClauses.push('tracks_unresolved = ?');
    params.push(update.tracksUnresolved);
  }
  if (update.errorMessage !== undefined) {
    setClauses.push('error_message = ?');
    params.push(update.errorMessage);
  }

  if (setClauses.length === 0) return;

  params.push(id);
  db.prepare(`UPDATE import_job_playlists SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
}

export function updateImportJob(
  jobId: string,
  update: Partial<Pick<ImportJob, 'status' | 'completedAt'>>,
): void {
  const db = getRecsDb();

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (update.status !== undefined) {
    setClauses.push('status = ?');
    params.push(update.status);
  }
  if (update.completedAt !== undefined) {
    setClauses.push('completed_at = ?');
    params.push(update.completedAt);
  }

  if (setClauses.length === 0) return;

  params.push(jobId);
  db.prepare(`UPDATE import_jobs SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
}

export function getActiveImportJob(createdBy: string | string[]): ImportJob | null {
  const db = getRecsDb();
  const userIds = Array.isArray(createdBy) ? createdBy : [createdBy];
  if (userIds.length === 0) return null;
  const placeholders = userIds.map(() => '?').join(', ');

  const row = db.prepare(`
    SELECT
      id,
      source_provider AS sourceProvider,
      target_provider AS targetProvider,
      status,
      created_by AS createdBy,
      created_at AS createdAt,
      completed_at AS completedAt,
      create_sync_pair AS createSyncPair,
      sync_interval AS syncInterval
    FROM import_jobs
    WHERE created_by IN (${placeholders})
      AND status IN ('pending', 'running')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(...userIds) as ImportJob | undefined;

  if (!row) return null;
  row.createSyncPair = Boolean(row.createSyncPair);
  return row;
}

// -----------------------------------------------------------------------------
// Import History
// -----------------------------------------------------------------------------

export function getImportHistory(createdBy: string | string[], limit = 20): ImportJobWithPlaylists[] {
  const db = getRecsDb();
  const userIds = Array.isArray(createdBy) ? createdBy : [createdBy];
  if (userIds.length === 0) return [];
  const placeholders = userIds.map(() => '?').join(', ');

  const jobs = db.prepare(`
    SELECT
      id,
      source_provider AS sourceProvider,
      target_provider AS targetProvider,
      status,
      created_by AS createdBy,
      created_at AS createdAt,
      completed_at AS completedAt,
      create_sync_pair AS createSyncPair,
      sync_interval AS syncInterval
    FROM import_jobs
    WHERE created_by IN (${placeholders})
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...userIds, limit) as ImportJob[];

  return jobs.map((job) => {
    job.createSyncPair = Boolean(job.createSyncPair);

    const playlists = db.prepare(`
      SELECT
        id, job_id AS jobId, source_playlist_id AS sourcePlaylistId,
        source_playlist_name AS sourcePlaylistName,
        target_playlist_id AS targetPlaylistId,
        status, track_count AS trackCount,
        tracks_resolved AS tracksResolved, tracks_added AS tracksAdded,
        tracks_unresolved AS tracksUnresolved,
        error_message AS errorMessage, position
      FROM import_job_playlists
      WHERE job_id = ?
      ORDER BY position ASC
    `).all(job.id) as ImportJobPlaylist[];

    const completedPlaylists = playlists.filter(
      (p) => p.status === 'done' || p.status === 'partial',
    ).length;

    return { ...job, playlists, totalPlaylists: playlists.length, completedPlaylists };
  });
}

// -----------------------------------------------------------------------------
// Cancel a queued playlist entry
// -----------------------------------------------------------------------------

export function cancelImportPlaylist(playlistEntryId: string, createdBy: string | string[]): boolean {
  const db = getRecsDb();
  const userIds = Array.isArray(createdBy) ? createdBy : [createdBy];
  if (userIds.length === 0) return false;
  const placeholders = userIds.map(() => '?').join(', ');

  const result = db.prepare(`
    UPDATE import_job_playlists
    SET status = 'cancelled'
    WHERE id = ?
      AND status = 'queued'
      AND job_id IN (SELECT id FROM import_jobs WHERE created_by IN (${placeholders}))
  `).run(playlistEntryId, ...userIds);

  return result.changes > 0;
}

// -----------------------------------------------------------------------------
// Admin queries
// -----------------------------------------------------------------------------

export function getRecentImportJobsAdmin(limit = 20): ImportJobWithPlaylists[] {
  const db = getRecsDb();

  const jobs = db.prepare(`
    SELECT
      id, source_provider AS sourceProvider, target_provider AS targetProvider,
      status, created_by AS createdBy, created_at AS createdAt,
      completed_at AS completedAt, create_sync_pair AS createSyncPair,
      sync_interval AS syncInterval
    FROM import_jobs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as ImportJob[];

  return jobs.map((job) => {
    job.createSyncPair = Boolean(job.createSyncPair);

    const playlists = db.prepare(`
      SELECT
        id, job_id AS jobId, source_playlist_id AS sourcePlaylistId,
        source_playlist_name AS sourcePlaylistName,
        target_playlist_id AS targetPlaylistId,
        status, track_count AS trackCount,
        tracks_resolved AS tracksResolved, tracks_added AS tracksAdded,
        tracks_unresolved AS tracksUnresolved,
        error_message AS errorMessage, position
      FROM import_job_playlists
      WHERE job_id = ?
      ORDER BY position ASC
    `).all(job.id) as ImportJobPlaylist[];

    const completed = playlists.filter((p) =>
      p.status === 'done' || p.status === 'failed' || p.status === 'partial' || p.status === 'cancelled'
    ).length;

    return {
      ...job,
      playlists,
      totalPlaylists: playlists.length,
      completedPlaylists: completed,
    };
  });
}
