import type { MusicProviderId } from '@/lib/music-provider/types';

export type SyncDirection = 'a-to-b' | 'b-to-a' | 'bidirectional';
export type SyncRunStatus = 'pending' | 'previewing' | 'executing' | 'done' | 'failed';

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
  autoSync: boolean;
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
}

export interface SyncPlan {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
  direction: SyncDirection;
  items: SyncDiffItem[];
  summary: {
    toAdd: number;
    toRemove: number;
    unresolved: number;
  };
}

export interface SyncApplyResult {
  added: number;
  removed: number;
  unresolved: string[];
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
