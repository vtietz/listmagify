/**
 * Hook for compare mode integration - registers panel tracks for cross-panel comparison.
 */

'use client';

import { useEffect, useCallback } from 'react';
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

  // Register tracks when playlist loads or changes
  useEffect(() => {
    if (!playlistId || !tracks || tracks.length === 0) {
      unregisterPanel(panelId);
      return;
    }
    const uris = tracks.map((t: Track) => t.uri);
    registerPanelTracks(panelId, uris);

    return () => unregisterPanel(panelId);
  }, [panelId, playlistId, tracks, registerPanelTracks, unregisterPanel]);

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
