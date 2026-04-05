import type { MusicProviderId } from '@/lib/music-provider/types';

export type SyncDirection = 'a-to-b' | 'b-to-a' | 'bidirectional';
export type SyncRunStatus = 'pending' | 'previewing' | 'executing' | 'done' | 'failed';
export type SyncInterval = 'off' | '15m' | '30m' | '1h' | '6h' | '12h' | '24h';
export type SyncIntervalOption = Exclude<SyncInterval, 'off'>;
export type SyncTrigger = 'manual' | 'auto_sync' | 'scheduler';

export const DEFAULT_SYNC_INTERVAL_OPTIONS: readonly SyncIntervalOption[] = ['15m', '30m', '1h', '6h', '12h', '24h'];

export function isSyncIntervalOption(value: string): value is SyncIntervalOption {
  return (DEFAULT_SYNC_INTERVAL_OPTIONS as readonly string[]).includes(value);
}

export function parseSyncIntervalOptions(raw: string | undefined): SyncIntervalOption[] {
  if (!raw) {
    return [...DEFAULT_SYNC_INTERVAL_OPTIONS];
  }

  const parsed = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(isSyncIntervalOption);

  if (parsed.length === 0) {
    return [...DEFAULT_SYNC_INTERVAL_OPTIONS];
  }

  return Array.from(new Set(parsed));
}

export interface SyncWarning {
  canonicalTrackId: string;
  title: string;
  artists: string[];
  reason: string;
}

export interface SyncPair {
  id: string;
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  sourcePlaylistName: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
  targetPlaylistName: string;
  direction: SyncDirection;
  createdBy: string;
  /** Maps provider ID to its prefixed userId for DB token lookups (e.g. { spotify: "spotify:simsonoo", tidal: "tidal:123" }) */
  providerUserIds: Record<string, string>;
  autoSync: boolean;
  syncInterval: SyncInterval;
  nextRunAt: string | null;
  consecutiveFailures: number;
  /** Last-seen snapshot ID for the source playlist (Spotify-only; null for TIDAL) */
  sourceSnapshotId: string | null;
  /** Last-seen snapshot ID for the target playlist (Spotify-only; null for TIDAL) */
  targetSnapshotId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncRun {
  id: string;
  syncPairId: string;
  status: SyncRunStatus;
  direction: SyncDirection;
  tracksAdded: number;
  tracksRemoved: number;
  tracksUnresolved: number;
  errorMessage: string | null;
  warnings: SyncWarning[];
  triggeredBy: SyncTrigger;
  startedAt: string;
  completedAt: string | null;
}

/** Used for inline sync (no saved pair) */
export interface SyncConfig {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
  direction: SyncDirection;
}

export type MaterializeStatus = 'resolved' | 'not_found' | 'unchecked';

export interface SyncDiffItem {
  canonicalTrackId: string;
  action: 'add' | 'remove';
  /** Which provider this item will be added to / removed from */
  targetProvider: MusicProviderId;
  title: string;
  artists: string[];
  durationMs: number;
  confidence: number;
  providerTrackId?: string | null;
  /** Target provider track ID resolved during preview materialization check */
  resolvedTargetTrackId?: string | null;
  /** Whether the track was found on the target provider during preview */
  materializeStatus?: MaterializeStatus;
}

export interface SyncPlan {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
  direction: SyncDirection;
  items: SyncDiffItem[];
  /** Desired canonical track ID order for each side after sync */
  targetOrder?: Record<string, string[]>;
  summary: {
    toAdd: number;
    toRemove: number;
    unresolved: number;
  };
}

export interface UnresolvedTrackInfo {
  canonicalTrackId: string;
  title: string;
  artists: string[];
  durationMs: number;
  reason: 'not_found' | 'materialize_failed' | 'no_provider_mapping';
}

export interface SyncApplyResult {
  added: number;
  removed: number;
  unresolved: UnresolvedTrackInfo[];
  errors: string[];
}

export interface SyncPreviewTrack {
  canonicalTrackId: string;
  title: string;
  artists: string[];
  durationMs: number;
}

export interface SyncPreviewResult {
  plan: SyncPlan;
  sourceTracks: SyncPreviewTrack[];
  targetTracks: SyncPreviewTrack[];
}
