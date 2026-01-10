'use client';

import { useEffect } from 'react';

import type { Track } from '@/lib/spotify/types';

type RegisterVirtualizer = (
  panelId: string,
  virtualizer: any,
  scrollRef: { current: HTMLDivElement | null },
  filteredTracks: Track[],
  canDrop: boolean
) => void;

type UnregisterVirtualizer = (panelId: string) => void;

export function useVirtualizerRegistration({
  panelId,
  playlistId,
  virtualizer,
  scrollRef,
  filteredTracks,
  canDrop,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
}: {
  panelId: string;
  playlistId: string | null | undefined;
  virtualizer: any;
  scrollRef: { current: HTMLDivElement | null };
  filteredTracks: Track[];
  canDrop: boolean;
  onRegisterVirtualizer: RegisterVirtualizer | undefined;
  onUnregisterVirtualizer: UnregisterVirtualizer | undefined;
}) {
  useEffect(() => {
    if (onRegisterVirtualizer && playlistId) {
      onRegisterVirtualizer(panelId, virtualizer, scrollRef, filteredTracks, canDrop);
    }

    return () => {
      if (onUnregisterVirtualizer) {
        onUnregisterVirtualizer(panelId);
      }
    };
  }, [
    panelId,
    playlistId,
    virtualizer,
    scrollRef,
    filteredTracks,
    canDrop,
    onRegisterVirtualizer,
    onUnregisterVirtualizer,
  ]);
}
