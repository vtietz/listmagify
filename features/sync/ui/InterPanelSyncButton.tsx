'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSyncDialogStore } from '@features/sync/stores/useSyncDialogStore';
import { useSyncPairForPlaylists } from '@features/sync/hooks/useSyncPairs';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { cn } from '@/lib/utils';

interface InterPanelSyncButtonProps {
  leftProviderId: MusicProviderId;
  leftPlaylistId: string | null;
  rightProviderId: MusicProviderId;
  rightPlaylistId: string | null;
  isHorizontal: boolean;
}

export function InterPanelSyncButton({
  leftProviderId,
  leftPlaylistId,
  rightProviderId,
  rightPlaylistId,
  isHorizontal,
}: InterPanelSyncButtonProps) {
  const openPreview = useSyncDialogStore((s) => s.openPreview);
  const existingPair = useSyncPairForPlaylists(
    leftProviderId,
    leftPlaylistId,
    rightProviderId,
    rightPlaylistId,
  );

  // Only show when both panels have loaded playlists
  if (!leftPlaylistId || !rightPlaylistId) return null;

  const hasActivePair = !!existingPair;

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'absolute z-10 h-6 w-6 rounded-full bg-background border border-border shadow-sm',
        'opacity-0 group-hover/handle:opacity-100 transition-opacity',
        hasActivePair
          ? 'bg-green-500/20 border-green-500/50 hover:bg-green-500/30 hover:border-green-500/60'
          : 'hover:bg-primary/10 hover:border-primary/50',
        isHorizontal
          ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
          : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
      )}
      title={hasActivePair ? 'Run existing sync pair' : 'Sync playlists between panels'}
      onClick={(e) => {
        e.stopPropagation();
        openPreview({
          sourceProvider: leftProviderId,
          sourcePlaylistId: leftPlaylistId,
          targetProvider: rightProviderId,
          targetPlaylistId: rightPlaylistId,
          direction: 'bidirectional',
          ...(existingPair ? { syncPairId: existingPair.id } : {}),
        });
      }}
    >
      <RefreshCw className={cn('h-3 w-3', hasActivePair && 'text-green-500')} />
    </Button>
  );
}
