/**
 * Hook for compare mode integration - registers panel tracks for cross-panel comparison.
 * Uses canonical keys (normalized title + artists) for cross-provider matching.
 */

'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useCompareModeStore, getCompareColor, getTrackCompareColor } from '@features/split-editor/stores/useCompareModeStore';
import { getCanonicalTrackKey } from '@/lib/music-provider/canonicalKey';
import type { Track } from '@/lib/music-provider/types';

function splitCompareKeys(key: string): string[] {
  return key.split('||').map((part) => part.trim()).filter(Boolean);
}

export function useCompareModeIntegration(
  panelId: string,
  playlistId: string | null | undefined,
  tracks: Track[]
) {
  const isCompareEnabled = useCompareModeStore((s) => s.isEnabled);
  const compareDistribution = useCompareModeStore((s) => s.distribution);
  const registerPanelTracks = useCompareModeStore((s) => s.registerPanelTracks);
  const unregisterPanel = useCompareModeStore((s) => s.unregisterPanel);

  // Memoize canonical keys to avoid re-registration when tracks array reference changes
  // but actual keys are the same (e.g., query re-fetches)
  const canonicalKeys = useMemo(() => {
    if (!tracks || tracks.length === 0) return [];
    return tracks.flatMap((t: Track) => splitCompareKeys(getCanonicalTrackKey(t)));
  }, [tracks]);

  // Serialize keys for dependency comparison (only re-register if keys actually changed)
  const keysFingerprint = useMemo(() => canonicalKeys.join('\0'), [canonicalKeys]);

  // Register tracks when playlist loads or keys actually change
  useEffect(() => {
    if (!playlistId || canonicalKeys.length === 0) {
      unregisterPanel(panelId);
      return;
    }
    registerPanelTracks(panelId, canonicalKeys);

    return () => unregisterPanel(panelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId, playlistId, keysFingerprint, registerPanelTracks, unregisterPanel]);

  const getCompareColorForTrack = useCallback(
    (canonicalKey: string) => {
      const keys = splitCompareKeys(canonicalKey);
      if (keys.length <= 1) {
        return getTrackCompareColor(canonicalKey, compareDistribution, isCompareEnabled);
      }

      if (!isCompareEnabled || !compareDistribution || compareDistribution.totalPanels <= 1) {
        return 'transparent';
      }

      let bestCount = 0;
      for (const key of keys) {
        const count = compareDistribution.trackToPanels.get(key)?.size ?? 0;
        if (count > bestCount) {
          bestCount = count;
        }
      }

      if (bestCount === 0) {
        return getCompareColor(1, compareDistribution.totalPanels);
      }

      return getCompareColor(bestCount, compareDistribution.totalPanels);
    },
    [compareDistribution, isCompareEnabled]
  );

  return {
    isCompareEnabled,
    getCompareColorForTrack,
  };
}
