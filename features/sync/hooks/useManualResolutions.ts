'use client';

import { useCallback, useMemo, useState } from 'react';
import type { MusicProviderId, Track } from '@/lib/music-provider/types';
import { useSaveManualMatch, useSetTrackSkipped } from '@features/sync/hooks/useManualMatch';
import {
  resolutionKey,
  type ManualResolution,
  type ManualResolutions,
} from '@features/sync/model/manualResolutions';

export interface ResolutionTarget {
  canonicalTrackId: string;
  targetProvider: MusicProviderId;
}

/**
 * Tracks the user's manual match / skip decisions inside a sync dialog.
 * Matches are saved as mappings and skips on the sync pair right away, so they
 * also apply to every later sync of the pair.
 */
export function useManualResolutions(syncPairId: string | undefined) {
  const [resolutions, setResolutions] = useState<ManualResolutions>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const saveMatch = useSaveManualMatch();
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

  const pick = useCallback(async (target: ResolutionTarget, track: Track) => {
    if (!track.id) return;
    try {
      const saved = await saveMatch.mutateAsync({
        canonicalTrackId: target.canonicalTrackId,
        provider: target.targetProvider,
        providerTrackId: track.id,
      });
      resolve(target, { kind: 'matched', providerTrackId: saved.providerTrackId, title: track.name, artists: track.artists });
    } catch {
      // apiFetch already reports the error; the picker stays open for another try.
    }
  }, [saveMatch, resolve]);

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
    setResolutions({});
    setOpenKey(null);
  }, []);

  const resolvedCount = useMemo(
    () => Object.values(resolutions).filter((resolution) => resolution.kind !== 'unskipped').length,
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
    isSaving: saveMatch.isPending || setSkipped.isPending,
    reset,
  };
}

export type ManualResolutionsState = ReturnType<typeof useManualResolutions>;
