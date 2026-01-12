/**
 * Hook for compare mode integration - registers panel tracks for cross-panel comparison.
 */

'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useCompareModeStore, getTrackCompareColor } from '@/hooks/useCompareModeStore';
import type { Track } from '@/lib/spotify/types';

export function useCompareModeIntegration(
  panelId: string,
  playlistId: string | null | undefined,
  tracks: Track[]
) {
  const isCompareEnabled = useCompareModeStore((s) => s.isEnabled);
  const compareDistribution = useCompareModeStore((s) => s.distribution);
  const registerPanelTracks = useCompareModeStore((s) => s.registerPanelTracks);
  const unregisterPanel = useCompareModeStore((s) => s.unregisterPanel);

  // Memoize track URIs to avoid re-registration when tracks array reference changes
  // but actual URIs are the same (e.g., query re-fetches)
  const trackUris = useMemo(() => {
    if (!tracks || tracks.length === 0) return [];
    return tracks.map((t: Track) => t.uri);
  }, [tracks]);

  // Serialize URIs for dependency comparison (only re-register if URIs actually changed)
  const urisKey = useMemo(() => trackUris.join('|'), [trackUris]);

  // Register tracks when playlist loads or URIs actually change
  useEffect(() => {
    if (!playlistId || trackUris.length === 0) {
      unregisterPanel(panelId);
      return;
    }
    registerPanelTracks(panelId, trackUris);

    return () => unregisterPanel(panelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId, playlistId, urisKey, registerPanelTracks, unregisterPanel]);

  const getCompareColorForTrack = useCallback(
    (trackUri: string) => {
      return getTrackCompareColor(trackUri, compareDistribution, isCompareEnabled);
    },
    [compareDistribution, isCompareEnabled]
  );

  return {
    isCompareEnabled,
    getCompareColorForTrack,
  };
}
