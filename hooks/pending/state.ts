import { create } from 'zustand';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { TrackPayload } from '@/hooks/dnd/types';
import type { MatchCandidate } from '@/lib/matching/providers';

export type PendingStatus = 'matching' | 'matched' | 'unresolved' | 'cancelled';

export interface PendingTrack {
  tempId: string;
  sourceProvider: MusicProviderId;
  sourceMeta: TrackPayload;
  sourcePanel: 'browse' | 'other';
  targetPlaylistId: string;
  targetProvider: MusicProviderId;
  createdAt: number;
  status: PendingStatus;
  position: number;
  errorMessage?: string | undefined;
  attentionReason?: string | undefined;
  matchedCandidate?: MatchCandidate | undefined;
  hidden?: { reason?: string | undefined } | undefined;
}

interface PlaylistPendingState {
  pending: PendingTrack[];
  unresolvedCount: number;
  hiddenMarkedCount: number;
}

interface PendingState {
  byPlaylist: Record<string, PlaylistPendingState>;
  addPending: (params: {
    targetPlaylistId: string;
    targetProvider: MusicProviderId;
    sourcePanel: 'browse' | 'other';
    position: number;
    payloads: TrackPayload[];
  }) => PendingTrack[];
  markMatched: (pendingId: string) => void;
  markUnresolved: (pendingId: string, reason: string, candidate?: MatchCandidate) => void;
  cancelPending: (pendingId: string) => void;
  removePending: (pendingId: string) => void;
  markHidden: (pendingId: string, reason?: string) => void;
  unhide: (pendingId: string) => void;
  clearPlaylist: (playlistId: string) => void;
  getPendingForPlaylist: (playlistId: string) => PendingTrack[];
  getUnresolvedTotal: () => number;
}

function generatePendingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function withRecomputedCounters(state: PendingState, playlistId: string): PendingState {
  const playlistState = state.byPlaylist[playlistId];
  if (!playlistState) {
    return state;
  }

  const unresolvedCount = playlistState.pending.filter((item) => item.status === 'unresolved').length;
  const hiddenMarkedCount = playlistState.pending.filter((item) => Boolean(item.hidden)).length;

  return {
    ...state,
    byPlaylist: {
      ...state.byPlaylist,
      [playlistId]: {
        ...playlistState,
        unresolvedCount,
        hiddenMarkedCount,
      },
    },
  };
}

function updatePendingItem(state: PendingState, pendingId: string, updater: (track: PendingTrack) => PendingTrack): PendingState {
  const entries = Object.entries(state.byPlaylist);
  for (const [playlistId, playlistState] of entries) {
    const index = playlistState.pending.findIndex((item) => item.tempId === pendingId);
    if (index < 0) {
      continue;
    }

    const nextPending = [...playlistState.pending];
    nextPending[index] = updater(nextPending[index]!);

    return withRecomputedCounters({
      ...state,
      byPlaylist: {
        ...state.byPlaylist,
        [playlistId]: {
          ...playlistState,
          pending: nextPending,
        },
      },
    }, playlistId);
  }

  return state;
}

export const usePendingStateStore = create<PendingState>((set, get) => ({
  byPlaylist: {},

  addPending: ({ targetPlaylistId, targetProvider, sourcePanel, position, payloads }) => {
    const added: PendingTrack[] = [];

    set((state) => {
      const current = state.byPlaylist[targetPlaylistId] ?? {
        pending: [],
        unresolvedCount: 0,
        hiddenMarkedCount: 0,
      };

      const created = payloads.map((payload, index) => {
        const pendingTrack: PendingTrack = {
          tempId: generatePendingId(),
          sourceProvider: payload.sourceProvider,
          sourceMeta: payload,
          sourcePanel,
          targetPlaylistId,
          targetProvider,
          createdAt: Date.now(),
          status: 'matching',
          position: position + index,
        };
        added.push(pendingTrack);
        return pendingTrack;
      });

      return withRecomputedCounters({
        ...state,
        byPlaylist: {
          ...state.byPlaylist,
          [targetPlaylistId]: {
            ...current,
            pending: [...current.pending, ...created],
          },
        },
      }, targetPlaylistId);
    });

    return added;
  },

  markMatched: (pendingId) => {
    set((state) => updatePendingItem(state, pendingId, (track) => ({
      ...track,
      status: 'matched',
      errorMessage: undefined,
      attentionReason: undefined,
    })));
  },

  markUnresolved: (pendingId, reason, candidate) => {
    set((state) => updatePendingItem(state, pendingId, (track) => ({
      ...track,
      status: 'unresolved',
      errorMessage: reason,
      attentionReason: reason,
      matchedCandidate: candidate,
    })));
  },

  cancelPending: (pendingId) => {
    set((state) => updatePendingItem(state, pendingId, (track) => ({
      ...track,
      status: 'cancelled',
    })));
  },

  removePending: (pendingId) => {
    set((state) => {
      const entries = Object.entries(state.byPlaylist);
      for (const [playlistId, playlistState] of entries) {
        if (!playlistState.pending.some((item) => item.tempId === pendingId)) {
          continue;
        }

        return withRecomputedCounters({
          ...state,
          byPlaylist: {
            ...state.byPlaylist,
            [playlistId]: {
              ...playlistState,
              pending: playlistState.pending.filter((item) => item.tempId !== pendingId),
            },
          },
        }, playlistId);
      }

      return state;
    });
  },

  markHidden: (pendingId, reason) => {
    set((state) => updatePendingItem(state, pendingId, (track) => ({
      ...track,
      hidden: { reason },
    })));
  },

  unhide: (pendingId) => {
    set((state) => updatePendingItem(state, pendingId, (track) => ({
      ...track,
      hidden: undefined,
    })));
  },

  clearPlaylist: (playlistId) => {
    set((state) => ({
      ...state,
      byPlaylist: {
        ...state.byPlaylist,
        [playlistId]: {
          pending: [],
          unresolvedCount: 0,
          hiddenMarkedCount: 0,
        },
      },
    }));
  },

  getPendingForPlaylist: (playlistId) => get().byPlaylist[playlistId]?.pending ?? [],

  getUnresolvedTotal: () => {
    return Object.values(get().byPlaylist).reduce((sum, playlistState) => {
      return sum + playlistState.unresolvedCount;
    }, 0);
  },
}));
