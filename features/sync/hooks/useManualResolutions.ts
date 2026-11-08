'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MusicProviderId, Track } from '@/lib/music-provider/types';
import { useResolveSyncTrack, useSaveManualMatch, useSetTrackSkipped } from '@features/sync/hooks/useManualMatch';
import { SYNC_PAIRS_KEY } from '@features/sync/hooks/useSyncPairs';
import {
  resolutionKey,
  type ManualResolution,
  type ManualResolutions,
} from '@features/sync/model/manualResolutions';

export interface ResolutionTarget {
  canonicalTrackId: string;
  targetProvider: MusicProviderId;
}

export interface PickOptions {
  /**
   * Also add the track to the pair's playlist right away (used after a sync
   * has run). Without it the match only applies to the next sync.
   */
  addNow?: boolean;
}

function needsSync(resolution: ManualResolution): boolean {
  if (resolution.kind === 'unskipped') return false;
  if (resolution.kind === 'matched') return !resolution.added;
  return true;
}

/**
 * Tracks the user's manual match / skip decisions inside a sync dialog.
 * `runId` is the run shown in the dialog; tracks added in place are cleared
 * from that run's warnings.
 * Matches are saved as mappings and skips on the sync pair right away, so they
 * also apply to every later sync of the pair.
 */
export function useManualResolutions(syncPairId: string | undefined, runId?: string) {
  const queryClient = useQueryClient();
  const [resolutions, setResolutions] = useState<ManualResolutions>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Read by `reset`, which must keep a stable identity (preview effects depend on it).
  const resolutionsRef = useRef(resolutions);
  useEffect(() => {
    resolutionsRef.current = resolutions;
  }, [resolutions]);
  const saveMatch = useSaveManualMatch();
  const resolveTrack = useResolveSyncTrack();
  const setSkipped = useSetTrackSkipped();

  const resolve = useCallback((target: ResolutionTarget, resolution: ManualResolution | null) => {
    const key = resolutionKey(target.targetProvider, target.canonicalTrackId);
    setResolutions((prev) => {
      const next = { ...prev };
      if (resolution) next[key] = resolution;
      else delete next[key];
      return next;
    });
    setOpenKey(null);
  }, []);

  const saveOnly = useCallback(async (target: ResolutionTarget, trackId: string) => {
    const saved = await saveMatch.mutateAsync({
      canonicalTrackId: target.canonicalTrackId,
      provider: target.targetProvider,
      providerTrackId: trackId,
    });
    return { providerTrackId: saved.providerTrackId, added: false };
  }, [saveMatch]);

  const saveAndAdd = useCallback(async (pairId: string, target: ResolutionTarget, trackId: string) => {
    const result = await resolveTrack.mutateAsync({
      syncPairId: pairId,
      canonicalTrackId: target.canonicalTrackId,
      targetProvider: target.targetProvider,
      providerTrackId: trackId,
      ...(runId ? { runId } : {}),
    });
    // Added, or already in the playlist: either way nothing is left to sync.
    return { providerTrackId: result.providerTrackId, added: true };
  }, [resolveTrack, runId]);

  const pick = useCallback(async (target: ResolutionTarget, track: Track, options?: PickOptions) => {
    if (!track.id) return;
    try {
      const saved = options?.addNow && syncPairId
        ? await saveAndAdd(syncPairId, target, track.id)
        : await saveOnly(target, track.id);
      resolve(target, {
        kind: 'matched',
        providerTrackId: saved.providerTrackId,
        title: track.name,
        artists: track.artists,
        added: saved.added,
      });
    } catch {
      // apiFetch already reports the error; the picker stays open for another try.
    }
  }, [syncPairId, saveAndAdd, saveOnly, resolve]);

  const updateSkipped = useCallback(async (target: ResolutionTarget, skipped: boolean, wasSkippedOnServer: boolean) => {
    if (!syncPairId) return;
    try {
      await setSkipped.mutateAsync({ syncPairId, canonicalTrackId: target.canonicalTrackId, skipped });
      if (skipped) resolve(target, { kind: 'skipped' });
      else resolve(target, wasSkippedOnServer ? { kind: 'unskipped' } : null);
    } catch {
      // apiFetch already reports the error.
    }
  }, [syncPairId, setSkipped, resolve]);

  const reset = useCallback(() => {
    // Tracks added in place changed the latest run; refresh it once the dialog closes
    // so the rows do not vanish while the user is still looking at them.
    const anyAdded = Object.values(resolutionsRef.current).some((r) => r.kind === 'matched' && r.added);
    if (anyAdded) void queryClient.invalidateQueries({ queryKey: SYNC_PAIRS_KEY });
    setResolutions({});
    setOpenKey(null);
  }, [queryClient]);

  /** Decisions that only take effect with another sync. */
  const resolvedCount = useMemo(
    () => Object.values(resolutions).filter(needsSync).length,
    [resolutions],
  );

  return {
    resolutions,
    resolvedCount,
    openKey,
    setOpenKey,
    pick,
    skip: (target: ResolutionTarget) => updateSkipped(target, true, false),
    /** `wasSkippedOnServer`: the skip came from the pair, not from this dialog. */
    unskip: (target: ResolutionTarget, wasSkippedOnServer: boolean) => updateSkipped(target, false, wasSkippedOnServer),
    canSkip: !!syncPairId,
    /** Picks can add the track to the playlist right away (needs a saved pair). */
    canAddNow: !!syncPairId,
    isSaving: saveMatch.isPending || resolveTrack.isPending || setSkipped.isPending,
    reset,
  };
}

export type ManualResolutionsState = ReturnType<typeof useManualResolutions>;
