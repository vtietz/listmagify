'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { eventBus } from '@/lib/sync/eventBus';
import { useSyncActivityStore } from '@features/sync/stores/useSyncActivityStore';
import type { SyncPlan, SyncApplyResult } from '@/lib/sync/types';
import { playlistTracksInfiniteByProvider } from '@/lib/api/queryKeys';
import { isLikedSongsPlaylist } from '@/lib/sync/likedSongs';
import { useSavedTracksStore } from '@features/playlists/hooks/useSavedTracksIndex';
import { useSplitGridStore } from '@features/split-editor/stores/useSplitGridStore';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { likedPlaylistKey } from '@features/playlists/hooks/useLikedVirtualPlaylist';

interface SyncApplyResponse {
  result: SyncApplyResult;
  runId?: string;
}

interface SyncApplyInput {
  plan: SyncPlan;
  syncPairId?: string;
}

type PlaylistRef = {
  playlistId: string;
  providerId: MusicProviderId;
};

function getAffectedPlaylists(plan: SyncPlan): PlaylistRef[] {
  if (plan.direction === 'bidirectional') {
    return [
      { playlistId: plan.targetPlaylistId, providerId: plan.targetProvider },
      { playlistId: plan.sourcePlaylistId, providerId: plan.sourceProvider },
    ];
  }

  return [{ playlistId: plan.targetPlaylistId, providerId: plan.targetProvider }];
}

function getOpenPanelPlaylistSet(): Set<string> {
  const panels = useSplitGridStore.getState().panels;
  const openKeys = new Set<string>();

  for (const panel of panels) {
    if (!panel.playlistId) continue;
    openKeys.add(`${panel.providerId}:${panel.playlistId}`);
  }

  return openKeys;
}

function isApplyResultUncertain(result: SyncApplyResult): boolean {
  return result.errors.length > 0 || result.unresolved.length > 0;
}

function shouldRefetchAfterApply(result: SyncApplyResult): boolean {
  return result.added > 0 || result.removed > 0 || isApplyResultUncertain(result);
}

async function refreshOpenSyncedPanels(params: {
  queryClient: ReturnType<typeof useQueryClient>;
  plan: SyncPlan;
  result: SyncApplyResult;
}): Promise<void> {
  const { queryClient, plan, result } = params;

  if (!shouldRefetchAfterApply(result)) {
    return;
  }

  const openPanelPlaylists = getOpenPanelPlaylistSet();
  const affected = getAffectedPlaylists(plan).filter((entry) => openPanelPlaylists.has(`${entry.providerId}:${entry.playlistId}`));

  if (affected.length === 0) {
    return;
  }

  const uncertain = isApplyResultUncertain(result);

  for (const entry of affected) {
    const queryKey = isLikedSongsPlaylist(entry.playlistId)
      ? likedPlaylistKey(entry.providerId)
      : playlistTracksInfiniteByProvider(entry.playlistId, entry.providerId);

    if (uncertain) {
      // Drop possibly inconsistent pages and reload active panels from page 1
      await queryClient.resetQueries({ queryKey, exact: true });
      continue;
    }

    await queryClient.refetchQueries({ queryKey, exact: true, type: 'active' });
  }
}

function syncLikedCacheFromPlan(plan: SyncPlan): void {
  const store = useSavedTracksStore.getState();
  const activeProvider = store.providerId;

  const playlistForProvider: Record<string, string> = {
    [plan.sourceProvider]: plan.sourcePlaylistId,
    [plan.targetProvider]: plan.targetPlaylistId,
  };

  const addIds: string[] = [];
  const removeIds: string[] = [];

  for (const item of plan.items) {
    if (item.targetProvider !== activeProvider) continue;
    if (!isLikedSongsPlaylist(playlistForProvider[item.targetProvider])) continue;

    if (item.action === 'add') {
      const id = item.resolvedTargetTrackId ?? item.providerTrackId ?? null;
      if (id) addIds.push(id);
      continue;
    }

    if (item.action === 'remove' && item.providerTrackId) {
      removeIds.push(item.providerTrackId);
    }
  }

  if (addIds.length > 0) {
    store.addToLikedSet(addIds);
  }
  if (removeIds.length > 0) {
    store.removeFromLikedSet(removeIds);
  }
}

/**
 * Mutation hook to apply a pre-computed sync plan.
 * Skips the preview step — sends the plan directly for execution.
 */
export function useSyncApply() {
  const queryClient = useQueryClient();
  const incrementActive = useSyncActivityStore((s) => s.incrementActive);
  const decrementActive = useSyncActivityStore((s) => s.decrementActive);

  return useMutation({
    mutationFn: async (input: SyncApplyInput) => {
      incrementActive();
      try {
        return await apiFetch<SyncApplyResponse>('/api/sync/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
      } catch (err) {
        decrementActive();
        throw err;
      }
    },
    onSuccess: async (data: SyncApplyResponse, variables: SyncApplyInput) => {
      decrementActive();
      const plan = variables.plan;

      await refreshOpenSyncedPanels({
        queryClient,
        plan,
        result: data.result,
      });

      syncLikedCacheFromPlan(plan);

      eventBus.emit('playlist:update', {
        playlistId: plan.targetPlaylistId,
        providerId: plan.targetProvider,
        cause: 'sync',
        syncOriginated: true,
      });
      eventBus.emit('playlist:update', {
        playlistId: plan.sourcePlaylistId,
        providerId: plan.sourceProvider,
        cause: 'sync',
        syncOriginated: true,
      });
    },
  });
}
