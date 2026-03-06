/**
 * Hook for computing cumulative track durations and hour boundaries.
 */

'use client';

import { useMemo } from 'react';
import { computeCumulativeDurationsAndHourBoundaries } from './panelUtils';
import type { Track } from '@/lib/music-provider/types';

export function useCumulativeDurations(filteredTracks: Track[]) {
  return useMemo(
    () => computeCumulativeDurationsAndHourBoundaries(filteredTracks),
    [filteredTracks]
  );
}
