/**
 * Metrics logging utilities.
 * Provides privacy-preserving event logging with hashed user identifiers.
 */

import { createHash } from 'crypto';
import { getDb, execute } from './db';
import { getMetricsConfig } from './env';

// Event types for type safety
export type MetricEvent =
  | 'login_success'
  | 'login_failure'
  | 'session_started'
  | 'session_ended'
  | 'track_add'
  | 'track_remove'
  | 'track_reorder'
  | 'liked_tracks_fetch'
  | 'audio_features_fetch'
  | 'api_call'
  | 'api_error'
  | 'ui_page_view';

export type MetricSource = 'api' | 'ui' | 'auth';

export type EntityType = 'track' | 'playlist' | 'session' | 'user' | 'page';

export interface EventParams {
  event: MetricEvent;
  userId?: string | undefined; // Raw Spotify user ID - will be hashed before storage
  source?: MetricSource | undefined;
  entityType?: EntityType | undefined;
  entityId?: string | undefined;
  count?: number | undefined;
  durationMs?: number | undefined;
  success?: boolean | undefined;
  errorCode?: string | undefined;
  meta?: Record<string, unknown> | undefined;
}

/**
 * Hash a Spotify user ID with the configured salt.
 * Uses SHA-256 for privacy-preserving identification.
 */
export function hashUserId(spotifyUserId: string): string {
  const config = getMetricsConfig();
  return createHash('sha256')
    .update(spotifyUserId + config.salt)
    .digest('hex')
    .substring(0, 32); // Truncate for reasonable storage
}

/**
 * Insert an event into the metrics database.
 * Silently no-ops if metrics are disabled.
 */
export function insertEvent(params: EventParams): void {
  const db = getDb();
  if (!db) return;

  try {
    const userHash = params.userId ? hashUserId(params.userId) : null;
    const metaJson = params.meta ? JSON.stringify(params.meta) : null;

    execute(
      `INSERT INTO events (user_hash, event, source, entity_type, entity_id, count, duration_ms, success, error_code, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userHash,
        params.event,
        params.source || 'api',
        params.entityType || null,
        params.entityId || null,
        params.count ?? null,
        params.durationMs ?? null,
        params.success !== undefined ? (params.success ? 1 : 0) : null,
        params.errorCode || null,
        metaJson
      ]
    );
  } catch (error) {
    // Log but don't throw - metrics should never break the app
    console.error('[metrics] Failed to insert event:', error);
  }
}

/**
 * Start a new session and return the session ID.
 */
export function startSession(userId: string, userAgent?: string): string {
  const db = getDb();
  if (!db) return '';

  try {
    const sessionId = crypto.randomUUID();
    const userHash = hashUserId(userId);
    const truncatedUserAgent = userAgent?.substring(0, 256) || null;

    execute(
      `INSERT INTO sessions (id, user_hash, user_agent)
       VALUES (?, ?, ?)`,
      [sessionId, userHash, truncatedUserAgent]
    );
    return sessionId;
  } catch (error) {
    console.error('[metrics] Failed to start session:', error);
    return '';
  }
}

/**
 * End a session by setting the ended_at timestamp.
 */
export function endSession(sessionId: string): void {
  const db = getDb();
  if (!db || !sessionId) return;

  try {
    execute(
      `UPDATE sessions SET ended_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [sessionId]
    );
  } catch (error) {
    console.error('[metrics] Failed to end session:', error);
  }
}

/**
 * Higher-order function to wrap API handlers with timing and error logging.
 * Usage: export const GET = withApiTiming(async (req) => { ... }, 'endpoint_name');
 */
export function withApiTiming<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  endpointName: string,
  getUserId?: (req: Request) => string | undefined
): T {
  return (async (...args: Parameters<T>): Promise<Response> => {
    const startTime = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const response = await handler(...args);
      success = response.ok;
      if (!response.ok) {
        errorCode = `HTTP_${response.status}`;
      }
      return response;
    } catch (error) {
      success = false;
      errorCode = error instanceof Error ? error.name : 'UNKNOWN_ERROR';
      throw error;
    } finally {
      const durationMs = Date.now() - startTime;
      const userId = getUserId?.(args[0]);

      insertEvent({
        event: success ? 'api_call' : 'api_error',
        userId,
        source: 'api',
        entityType: 'page',
        entityId: endpointName,
        durationMs,
        success,
        errorCode,
      });
    }
  }) as T;
}

/**
 * Log a track operation (add, remove, reorder).
 */
export function logTrackOperation(
  operation: 'track_add' | 'track_remove' | 'track_reorder',
  userId: string | undefined,
  playlistId: string,
  count: number
): void {
  insertEvent({
    event: operation,
    userId,
    source: 'api',
    entityType: 'playlist',
    entityId: playlistId,
    count,
    success: true,
  });
}

/**
 * Log a fetch operation (liked tracks, audio features).
 */
export function logFetchOperation(
  operation: 'liked_tracks_fetch' | 'audio_features_fetch',
  userId: string | undefined,
  count: number,
  durationMs?: number
): void {
  insertEvent({
    event: operation,
    userId,
    source: 'api',
    count,
    durationMs,
    success: true,
  });
}

/**
 * Log authentication events.
 */
export function logAuthEvent(
  event: 'login_success' | 'login_failure',
  userId?: string,
  errorCode?: string
): void {
  insertEvent({
    event,
    userId,
    source: 'auth',
    entityType: 'user',
    success: event === 'login_success',
    errorCode,
  });
}

/**
 * Log page view (from client).
 */
export function logPageView(userId: string | undefined, route: string): void {
  insertEvent({
    event: 'ui_page_view',
    userId,
    source: 'ui',
    entityType: 'page',
    entityId: route,
  });
}
