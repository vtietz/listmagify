/**
 * API route instrumentation helpers.
 * These functions can be called from API routes to log metrics
 * without modifying the existing route logic significantly.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { logTrackOperation, logFetchOperation, insertEvent } from '@/lib/metrics';

/**
 * Get the current user's Spotify ID from the session.
 * Used for metrics logging.
 */
export async function getCurrentUserId(): Promise<string | undefined> {
  try {
    const session = await getServerSession(authOptions);
    // The Spotify user ID is stored in the token's sub or can be derived from email
    return (session as any)?.user?.id || (session as any)?.sub;
  } catch {
    return undefined;
  }
}

/**
 * Log a track add operation.
 */
export async function logTrackAdd(playlistId: string, count: number): Promise<void> {
  const userId = await getCurrentUserId();
  logTrackOperation('track_add', userId, playlistId, count);
}

/**
 * Log a track remove operation.
 */
export async function logTrackRemove(playlistId: string, count: number): Promise<void> {
  const userId = await getCurrentUserId();
  logTrackOperation('track_remove', userId, playlistId, count);
}

/**
 * Log a track reorder operation.
 */
export async function logTrackReorder(playlistId: string, rangeLength: number): Promise<void> {
  const userId = await getCurrentUserId();
  logTrackOperation('track_reorder', userId, playlistId, rangeLength);
}

/**
 * Log a liked tracks fetch operation.
 */
export async function logLikedTracksFetch(count: number, durationMs?: number): Promise<void> {
  const userId = await getCurrentUserId();
  logFetchOperation('liked_tracks_fetch', userId, count, durationMs);
}

/**
 * Log an API error.
 */
export async function logApiError(
  endpoint: string,
  errorCode: string,
  durationMs?: number
): Promise<void> {
  const userId = await getCurrentUserId();
  insertEvent({
    event: 'api_error',
    userId,
    source: 'api',
    entityType: 'page',
    entityId: endpoint,
    durationMs,
    success: false,
    errorCode,
  });
}
