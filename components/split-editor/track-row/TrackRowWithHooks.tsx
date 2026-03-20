'use client';

import { useCallback } from 'react';

import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useAutoScrollTextStore } from '@/hooks/useAutoScrollTextStore';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useDndStateStore } from '@/hooks/dnd';
import { useMobileOverlayStore } from '../mobile/MobileBottomNav';
import { useDragHandle } from '../mobile/DragHandle';
import { TrackRowInner } from './TrackRowInner';
import type { TrackRowProps, TrackRowSharedContext } from './types';

export function TrackRowWithHooks(props: TrackRowProps) {
  const { isCompact } = useCompactModeStore();
  const { isEnabled: isAutoScrollEnabled } = useAutoScrollTextStore();
  const { open: openBrowsePanel, setActiveTab, setSearchQuery, setSearchFilter, providerId } = useBrowsePanelStore();
  const togglePoint = useInsertionPointsStore((s) => s.togglePoint);
  const hasActiveMarkers = useInsertionPointsStore((s) => s.hasActiveMarkers);
  const { isPhone } = useDeviceType();
  const setMobileOverlay = useMobileOverlayStore((s) => s.setActiveOverlay);
  const isDndActive = useDndStateStore((s) => s.activeId !== null);
  const openContextMenu = useContextMenuStore((s) => s.openMenu);
  const { showHandle, handleOnlyDrag } = useDragHandle();

  const openSpotifyBrowsePanel = useCallback(() => {
    setActiveTab('browse');
    openBrowsePanel();
  }, [setActiveTab, openBrowsePanel]);

  const ctx: TrackRowSharedContext = {
    isCompact,
    isAutoScrollEnabled,
    openBrowsePanel: openSpotifyBrowsePanel,
    providerId,
    setSearchQuery,
    setSearchFilter,
    togglePoint,
    hasAnyMarkersGlobal: hasActiveMarkers(),
    isPhone,
    setMobileOverlay,
    isDndActive,
    openContextMenu,
    showHandle,
    handleOnlyDrag,
  };

  return <TrackRowInner {...props} ctx={ctx} />;
}
