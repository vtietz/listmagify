/**
 * Client component that initializes SplitGrid with a single panel for a playlist.
 * Used by playlist detail route to provide consistent editing experience.
 * 
 * If a layout URL param is present, it will be used instead of initializing
 * a single panel (handled by useSplitUrlSync in SplitGrid).
 */

'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { SplitGrid } from './SplitGrid';

interface SinglePlaylistViewProps {
  playlistId: string;
}

export function SinglePlaylistView({ playlistId }: SinglePlaylistViewProps) {
  const searchParams = useSearchParams();
  const initializeSinglePanel = useSplitGridStore((state) => state.initializeSinglePanel);
  
  // Check if URL has a layout param - if so, let useSplitUrlSync handle it
  const hasLayoutParam = searchParams.has('layout');

  useEffect(() => {
    // Only initialize single panel if no layout param in URL
    // Otherwise useSplitUrlSync will hydrate from URL
    if (!hasLayoutParam) {
      initializeSinglePanel(playlistId);
    }
  }, [playlistId, initializeSinglePanel, hasLayoutParam]);

  return <SplitGrid />;
}
