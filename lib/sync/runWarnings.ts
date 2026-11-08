import type { SyncWarning, UnresolvedTrackInfo } from '@/lib/sync/types';

function formatUnresolvedReason(reason: UnresolvedTrackInfo['reason']): string {
  if (reason === 'not_found') return 'Not found on target provider';
  if (reason === 'materialize_failed') return 'Search on target provider failed';
  return 'No track mapping for target provider';
}

/**
 * Warnings stored on a sync run for the tracks it could not resolve. Keeps the
 * target provider and duration so the user can match the track by hand later.
 */
export function toSyncWarnings(unresolved: UnresolvedTrackInfo[]): SyncWarning[] {
  return unresolved.map((info) => ({
    canonicalTrackId: info.canonicalTrackId,
    title: info.title,
    artists: info.artists,
    reason: formatUnresolvedReason(info.reason),
    durationMs: info.durationMs,
    ...(info.targetProvider ? { targetProvider: info.targetProvider } : {}),
  }));
}
