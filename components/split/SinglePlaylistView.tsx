/**
 * Client component that initializes SplitGrid with a single panel for a playlist.
 * Used by playlist detail route to provide consistent editing experience.
 */

'use client';

import { useEffect } from 'react';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { SplitGrid } from './SplitGrid';

interface SinglePlaylistViewProps {
  playlistId: string;
}

export function SinglePlaylistView({ playlistId }: SinglePlaylistViewProps) {
  const initializeSinglePanel = useSplitGridStore((state) => state.initializeSinglePanel);

  useEffect(() => {
    // Initialize store with single panel on mount
    initializeSinglePanel(playlistId);
  }, [playlistId, initializeSinglePanel]);

  return <SplitGrid />;
}
