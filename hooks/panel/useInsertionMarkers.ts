/**
 * Hook for managing insertion markers on a playlist panel.
 */

'use client';

import { useMemo } from 'react';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';

export function useInsertionMarkers(playlistId: string | null | undefined) {
  const insertionMarkers = useInsertionPointsStore((s) => s.getMarkers(playlistId ?? ''));
  const clearInsertionMarkers = useInsertionPointsStore((s) => s.clearPlaylist);

  const activeMarkerIndices = useMemo(
    () => new Set(insertionMarkers.map((m) => m.index)),
    [insertionMarkers]
  );

  return {
    insertionMarkers,
    activeMarkerIndices,
    clearInsertionMarkers,
  };
}
