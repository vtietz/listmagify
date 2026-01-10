/**
 * Hook for prefetching contributor profiles when a playlist has multiple contributors.
 */

'use client';

import { useMemo } from 'react';
import { usePrefetchContributorProfiles, useUserProfilesCache } from '@/hooks/useUserProfiles';
import { hasMultipleContributors as checkMultipleContributors } from './panelUtils';
import type { Track } from '@/lib/spotify/types';

export function useContributorsPrefetch(tracks: Track[]) {
  const hasMultipleContributors = useMemo(
    () => checkMultipleContributors(tracks),
    [tracks]
  );

  usePrefetchContributorProfiles(hasMultipleContributors ? tracks : []);
  const { getProfile } = useUserProfilesCache();

  return {
    hasMultipleContributors,
    getProfile,
  };
}
