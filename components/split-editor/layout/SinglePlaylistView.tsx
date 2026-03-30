/**
 * Client component that initializes SplitGrid with a single panel for a playlist.
 * Used by playlist detail route to provide consistent editing experience.
 * 
 * If a layout URL param is present, it will be used instead of initializing
 * a single panel (handled by useSplitUrlSync in SplitGrid).
 */

'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSplitGridStore } from '@features/split-editor/stores/useSplitGridStore';
import { SplitGrid } from './SplitGrid';

interface SinglePlaylistViewProps {
  playlistId: string;
}

export function SinglePlaylistView({ playlistId }: SinglePlaylistViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initializeSinglePanel = useSplitGridStore((state) => state.initializeSinglePanel);
  const providerParam = searchParams.get('provider');
  const providerId = providerParam === 'tidal' ? 'tidal' : 'spotify';

  // Check if URL has a layout param - if so, let useSplitUrlSync handle it
  const hasLayoutParam = searchParams.has('layout');

  // Redirect to playlists list when all panels are closed.
  // Uses a store subscription for immediate response (no render cycle delay).
  useEffect(() => {
    let initialized = false;

    const unsubscribe = useSplitGridStore.subscribe((state, prevState) => {
      // Mark as initialized once root is first set
      if (state.root && !initialized) {
        initialized = true;
      }
      // Redirect when root transitions from non-null to null (user closed last panel)
      if (initialized && prevState.root && !state.root) {
        const providerQuery =
          providerParam === 'spotify' || providerParam === 'tidal'
            ? `?provider=${providerParam}`
            : '';
        router.replace(`/playlists${providerQuery}`);
      }
    });

    return unsubscribe;
  }, [router, providerParam]);

  useEffect(() => {
    // Only initialize single panel if no layout param in URL
    // Otherwise useSplitUrlSync will hydrate from URL
    if (!hasLayoutParam) {
      initializeSinglePanel(playlistId, providerId);
    }
  }, [playlistId, providerId, initializeSinglePanel, hasLayoutParam]);

  return <SplitGrid />;
}
