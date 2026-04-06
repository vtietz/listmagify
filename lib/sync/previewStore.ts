import { randomUUID } from 'crypto';
import { getRecsDb } from '@/lib/recs/db';
import type { SyncPreviewResult, SyncPreviewRun, SyncPreviewRunStatus } from '@/lib/sync/types';
import type { SyncConfig } from '@/lib/sync/types';
import type { SyncMatchThresholds } from '@/lib/sync/executor';
import type { MusicProviderId } from '@/lib/music-provider/types';

interface SyncPreviewRunRow {
  id: string;
  status: SyncPreviewRunStatus;
  phase: string;
  progress: number;
  createdBy: string;
  requestJson: string | null;
  matchThresholdsJson: string | null;
  resultJson: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface SyncPreviewRunRequest {
  id: string;
  config: SyncConfig;
  matchThresholds?: SyncMatchThresholds;
  providerUserIds?: Partial<Record<MusicProviderId, string>>;
}

type SyncPreviewRunRequestPayload = {
  config: SyncConfig;
  providerUserIds?: Partial<Record<MusicProviderId, string>>;
};

function sanitizeProviderUserIds(input: unknown): Partial<Record<MusicProviderId, string>> | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const source = input as Record<string, unknown>;
  const result: Partial<Record<MusicProviderId, string>> = {};

  if (typeof source.spotify === 'string' && source.spotify.length > 0) {
    result.spotify = source.spotify;
  }
  if (typeof source.tidal === 'string' && source.tidal.length > 0) {
    result.tidal = source.tidal;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mapSyncPreviewRunRow(row: SyncPreviewRunRow): SyncPreviewRun {
  return {
    id: row.id,
    status: row.status,
    phase: row.phase,
    progress: row.progress,
    createdBy: row.createdBy,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function parseResult(resultJson: string | null): SyncPreviewResult | null {
  if (!resultJson) {
    return null;
  }

  try {
    return JSON.parse(resultJson) as SyncPreviewResult;
  } catch {
    return null;
  }
}

function parseRequest(
  requestJson: string | null,
  matchThresholdsJson: string | null,
): { config: SyncConfig; matchThresholds?: SyncMatchThresholds; providerUserIds?: Partial<Record<MusicProviderId, string>> } | null {
  if (!requestJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(requestJson) as unknown;
    let config: SyncConfig;
    let providerUserIds: Partial<Record<MusicProviderId, string>> | undefined;

    if (
      parsed
      && typeof parsed === 'object'
      && 'config' in (parsed as Record<string, unknown>)
    ) {
      const payload = parsed as SyncPreviewRunRequestPayload;
      config = payload.config;
      providerUserIds = sanitizeProviderUserIds(payload.providerUserIds);
    } else {
      // Backward compatibility for rows that stored only SyncConfig in request_json.
      config = parsed as SyncConfig;
    }

    const matchThresholds = matchThresholdsJson
      ? (JSON.parse(matchThresholdsJson) as SyncMatchThresholds)
      : undefined;

    if (!matchThresholds) {
      if (!providerUserIds) {
        return { config };
      }
      return { config, providerUserIds };
    }

    if (!providerUserIds) {
      return { config, matchThresholds };
    }

    return { config, matchThresholds, providerUserIds };
  } catch {
    return null;
  }
}

function ownershipCondition(userIds: string[]): { sql: string; params: string[] } {
  const createdByPlaceholders = userIds.map(() => '?').join(', ');
  return {
    sql: `created_by IN (${createdByPlaceholders})`,
    params: [...userIds],
  };
}

export function createSyncPreviewRun(
  createdBy: string,
  config: SyncConfig,
  matchThresholds?: SyncMatchThresholds,
  providerUserIds?: Partial<Record<MusicProviderId, string>>,
): SyncPreviewRun {
  const db = getRecsDb();
  const id = randomUUID();

  const requestPayload: SyncPreviewRunRequestPayload = {
    config,
    ...(providerUserIds ? { providerUserIds } : {}),
  };

  db.prepare(`
    INSERT INTO sync_preview_runs (
      id,
      status,
      phase,
      progress,
      created_by,
      request_json,
      match_thresholds_json
    ) VALUES (?, 'pending', 'queued', 0, ?, ?, ?)
  `).run(
    id,
    createdBy,
    JSON.stringify(requestPayload),
    matchThresholds ? JSON.stringify(matchThresholds) : null,
  );

  const row = db.prepare(`
    SELECT
      id,
      status,
      phase,
      progress,
      created_by AS createdBy,
      request_json AS requestJson,
      match_thresholds_json AS matchThresholdsJson,
      result_json AS resultJson,
      error_message AS errorMessage,
      started_at AS startedAt,
      completed_at AS completedAt
    FROM sync_preview_runs
    WHERE id = ?
  `).get(id) as SyncPreviewRunRow | undefined;

  if (!row) {
    throw new Error('Failed to create sync preview run');
  }

  return mapSyncPreviewRunRow(row);
}

export function updateSyncPreviewRun(
  id: string,
  update: {
    status?: SyncPreviewRunStatus;
    phase?: string;
    progress?: number;
    resultJson?: string | null;
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
  if (update.phase !== undefined) {
    setClauses.push('phase = ?');
    params.push(update.phase);
  }
  if (update.progress !== undefined) {
    setClauses.push('progress = ?');
    params.push(Math.max(0, Math.min(100, Math.floor(update.progress))));
  }
  if (update.resultJson !== undefined) {
    setClauses.push('result_json = ?');
    params.push(update.resultJson);
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
  db.prepare(`UPDATE sync_preview_runs SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
}

export function getSyncPreviewRun(
  id: string,
  createdBy?: string | string[],
): { run: SyncPreviewRun; result: SyncPreviewResult | null } | null {
  const db = getRecsDb();

  let row: SyncPreviewRunRow | undefined;

  if (createdBy) {
    const userIds = Array.isArray(createdBy) ? createdBy : [createdBy];
    if (userIds.length === 0) {
      return null;
    }

    const ownership = ownershipCondition(userIds);
    row = db.prepare(`
      SELECT
        id,
        status,
        phase,
        progress,
        created_by AS createdBy,
        request_json AS requestJson,
        match_thresholds_json AS matchThresholdsJson,
        result_json AS resultJson,
        error_message AS errorMessage,
        started_at AS startedAt,
        completed_at AS completedAt
      FROM sync_preview_runs
      WHERE id = ?
        AND ${ownership.sql}
    `).get(id, ...ownership.params) as SyncPreviewRunRow | undefined;
  } else {
    row = db.prepare(`
      SELECT
        id,
        status,
        phase,
        progress,
        created_by AS createdBy,
        request_json AS requestJson,
        match_thresholds_json AS matchThresholdsJson,
        result_json AS resultJson,
        error_message AS errorMessage,
        started_at AS startedAt,
        completed_at AS completedAt
      FROM sync_preview_runs
      WHERE id = ?
    `).get(id) as SyncPreviewRunRow | undefined;
  }

  if (!row) {
    return null;
  }

  return {
    run: mapSyncPreviewRunRow(row),
    result: parseResult(row.resultJson),
  };
}

export function claimNextPendingSyncPreviewRun(): SyncPreviewRunRequest | null {
  const db = getRecsDb();

  const row = db.transaction(() => {
    const candidate = db.prepare(`
      SELECT
        id,
        request_json AS requestJson,
        match_thresholds_json AS matchThresholdsJson
      FROM sync_preview_runs
      WHERE status = 'pending'
      ORDER BY started_at ASC
      LIMIT 1
    `).get() as {
      id: string;
      requestJson: string | null;
      matchThresholdsJson: string | null;
    } | undefined;

    if (!candidate) {
      return null;
    }

    const updated = db.prepare(`
      UPDATE sync_preview_runs
      SET status = 'executing', phase = 'queued', progress = 0
      WHERE id = ? AND status = 'pending'
    `).run(candidate.id);

    if (updated.changes === 0) {
      return null;
    }

    return candidate;
  })();

  if (!row) {
    return null;
  }

  const request = parseRequest(row.requestJson, row.matchThresholdsJson);
  if (!request) {
    updateSyncPreviewRun(row.id, {
      status: 'failed',
      phase: 'failed',
      progress: 100,
      errorMessage: 'Invalid preview request payload.',
      completedAt: new Date().toISOString(),
    });
    return null;
  }

  if (!request.matchThresholds) {
    if (!request.providerUserIds) {
      return {
        id: row.id,
        config: request.config,
      };
    }

    return {
      id: row.id,
      config: request.config,
      providerUserIds: request.providerUserIds,
    };
  }

  if (!request.providerUserIds) {
    return {
      id: row.id,
      config: request.config,
      matchThresholds: request.matchThresholds,
    };
  }

  return {
    id: row.id,
    config: request.config,
    matchThresholds: request.matchThresholds,
    providerUserIds: request.providerUserIds,
  };
}

export function requeueExecutingSyncPreviewRuns(): number {
  const db = getRecsDb();

  const result = db.prepare(`
    UPDATE sync_preview_runs
    SET
      status = 'pending',
      phase = 'queued',
      progress = 0,
      error_message = NULL,
      completed_at = NULL
    WHERE status = 'executing'
  `).run();

  return result.changes;
}
