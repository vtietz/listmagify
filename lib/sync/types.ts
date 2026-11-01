import type { MusicProviderId } from '@/lib/music-provider/types';

export type SyncDirection = 'a-to-b' | 'b-to-a' | 'bidirectional';
export type SyncRunStatus = 'pending' | 'previewing' | 'executing' | 'done' | 'failed';
export type SyncPreviewRunStatus = 'pending' | 'executing' | 'done' | 'failed';
export type FixedSyncInterval = '15m' | '30m' | '1h' | '6h' | '12h' | '24h' | '3d' | '7d';
/** `smart`: checks often while a pair is active and backs off while nothing changes */
export type SyncInterval = 'off' | 'smart' | FixedSyncInterval;
export type SyncIntervalOption = Exclude<SyncInterval, 'off'>;
export type SyncTrigger = 'manual' | 'auto_sync' | 'scheduler';

const FIXED_SYNC_INTERVALS: readonly FixedSyncInterval[] = ['15m', '30m', '1h', '6h', '12h', '24h', '3d', '7d'];

export const DEFAULT_SYNC_INTERVAL_OPTIONS: readonly SyncIntervalOption[] = [
  'smart', '15m', '30m', '1h', '6h', '12h', '24h', '7d',
];

export const SMART_SYNC_INTERVAL_HINT =
  'Smart: checks every 15 minutes while the playlists change and backs off to weekly while they don\'t. Edits made in Listmagify sync within minutes.';

export function formatSyncInterval(interval: string): string {
  if (interval === 'off') return 'Off';
  if (interval === 'smart') return 'Smart';
  return interval;
}

export function isSyncIntervalOption(value: string): value is SyncIntervalOption {
  return value === 'smart' || (FIXED_SYNC_INTERVALS as readonly string[]).includes(value);
}

/**
 * Interval options offered to users. `smart` is a mode rather than an interval,
 * so it is always offered, even when SYNC_INTERVAL_OPTIONS lists only intervals.
 */
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

  return Array.from(new Set<SyncIntervalOption>(['smart', ...parsed]));
}

export interface SyncWarning {
  canonicalTrackId: string;
  title: string;
  artists: string[];
  reason: string;
  /** Provider the track could not be added to (absent on runs recorded before this was tracked) */
  targetProvider?: MusicProviderId;
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
  /** Change token of the source playlist after the last full read (Spotify snapshot ID, TIDAL last-modified) */
  sourceSnapshotId: string | null;
  /** Change token of the target playlist after the last full read */
  targetSnapshotId: string | null;
  /** When both playlists were last read in full; null before the first sync */
  lastFullReadAt?: string | null;
  /** Baseline membership canonical IDs for source side used by bidirectional merge. */
  sourceMembershipBaseline: string[] | null;
  /** Baseline membership canonical IDs for target side used by bidirectional merge. */
  targetMembershipBaseline: string[] | null;
  /** Baseline canonical order for source side used by bidirectional merge. */
  sourceOrderBaseline: string[] | null;
  /** Baseline canonical order for target side used by bidirectional merge. */
  targetOrderBaseline: string[] | null;
  /** Last observed source-side change timestamp (ISO). */
  sourceLastChangeAt: string | null;
  /** Last observed target-side change timestamp (ISO). */
  targetLastChangeAt: string | null;
  /** Canonical track IDs the user chose to leave out of this pair's syncs. */
  skippedCanonicalIds: string[];
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
  /** Saved pair this sync belongs to; supplies baselines and skipped tracks */
  syncPairId?: string;
}

/** `skipped`: the user chose to leave this track out of the pair's syncs. */
export type MaterializeStatus = 'resolved' | 'not_found' | 'timed_out' | 'unchecked' | 'skipped';

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
  /** Set when the user picked the target track by hand in the preview */
  manualMatch?: boolean;
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
  /** Bidirectional only: which side changed since the last sync (stored with the baselines) */
  sideChanges?: { source: boolean; target: boolean };
  /** Per provider: providerTrackId -> sync key, where it differs from the resolved canonical ID */
  trackKeys?: Partial<Record<MusicProviderId, Record<string, string>>>;
  /**
   * Sides that would lose an implausibly large share of their tracks. Unattended
   * runs hold such a plan; in the preview the user confirms it by applying.
   */
  massRemoval?: MassRemovalWarning[];
  summary: {
    toAdd: number;
    toRemove: number;
    unresolved: number;
  };
}

/** Start of the error message of a run held for review because of a mass removal. */
export const SYNC_HELD_FOR_REVIEW_PREFIX = 'Sync held for review';

export interface MassRemovalWarning {
  provider: MusicProviderId;
  /** Tracks the plan removes from this side */
  count: number;
  /** Tracks currently on this side */
  total: number;
}

export interface UnresolvedTrackInfo {
  canonicalTrackId: string;
  title: string;
  artists: string[];
  durationMs: number;
  reason: 'not_found' | 'materialize_failed' | 'no_provider_mapping';
  /** Provider the track could not be added to / removed from */
  targetProvider?: MusicProviderId;
}

export interface SyncApplyResult {
  added: number;
  removed: number;
  unresolved: UnresolvedTrackInfo[];
  errors: string[];
  /** Per provider: providerTrackId -> sync key of the plan item it was added for */
  addedKeys?: Partial<Record<MusicProviderId, Record<string, string>>>;
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

export interface SyncPreviewRun {
  id: string;
  status: SyncPreviewRunStatus;
  phase: string;
  progress: number;
  createdBy: string;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}
