/**
 * Hook to fetch and cache Spotify user profiles.
 * Used to display contributor avatars with proper names and images.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api/client';

export interface UserProfile {
  id: string;
  displayName: string | null;
  imageUrl: string | null;
}

/**
 * Query key for user profile
 */
export const userProfileKey = (userId: string) => ['user-profile', userId] as const;

/**
 * Fetch a single user profile
 */
async function fetchUserProfile(userId: string): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/api/users/${encodeURIComponent(userId)}`);
}

/**
 * Hook to get a single user's profile with caching.
 * Profiles are cached for 1 hour since they rarely change.
 */
export function useUserProfile(userId: string | undefined | null) {
  return useQuery({
    queryKey: userId ? userProfileKey(userId) : ['user-profile', null],
    queryFn: () => fetchUserProfile(userId!),
    enabled: !!userId,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
  });
}

/**
 * Hook to batch-prefetch multiple user profiles.
 * Fetches missing profiles in parallel and caches them.
 */
export function useUserProfilesCache() {
  const queryClient = useQueryClient();

  const prefetchUsers = useCallback(async (userIds: string[]) => {
    // Filter to only IDs we don't have cached yet
    const uncachedIds = userIds.filter(id => {
      const cached = queryClient.getQueryData(userProfileKey(id));
      return !cached;
    });

    if (uncachedIds.length === 0) return;

    // Fetch in parallel (limit to avoid overwhelming the API)
    const batchSize = 10;
    for (let i = 0; i < uncachedIds.length; i += batchSize) {
      const batch = uncachedIds.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (userId) => {
          try {
            const profile = await fetchUserProfile(userId);
            queryClient.setQueryData(userProfileKey(userId), profile);
          } catch (_err) {
            // Silent fail - we'll just show fallback
            console.debug('[useUserProfilesCache] Failed to fetch profile:', userId);
          }
        })
      );
    }
  }, [queryClient]);

  const getProfile = useCallback((userId: string): UserProfile | undefined => {
    return queryClient.getQueryData(userProfileKey(userId));
  }, [queryClient]);

  return { prefetchUsers, getProfile };
}

/**
 * Hook to prefetch user profiles for a list of tracks.
 * Call this when tracks are loaded to pre-warm the cache.
 */
export function usePrefetchContributorProfiles(tracks: Array<{ addedBy?: { id: string } | null }> | undefined) {
  const { prefetchUsers } = useUserProfilesCache();

  useEffect(() => {
    if (!tracks || tracks.length === 0) return;

    // Extract unique contributor IDs
    const contributorIds = new Set<string>();
    for (const track of tracks) {
      if (track.addedBy?.id) {
        contributorIds.add(track.addedBy.id);
      }
    }

    if (contributorIds.size > 0) {
      // Prefetch in background
      prefetchUsers(Array.from(contributorIds));
    }
  }, [tracks, prefetchUsers]);
}
