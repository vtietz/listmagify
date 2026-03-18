/**
 * Hook for binding to the split grid store and providing panel operations.
 */

'use client';

import { useCallback } from 'react';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { useMobileOverlayStore } from '@/components/split-editor/mobile/MobileBottomNav';
import { useDeviceType } from '@/hooks/useDeviceType';
import { eventBus } from '@/lib/sync/eventBus';
import type { SortKey, SortDirection } from '@/lib/utils/sort';
import type { MobileOverlay } from '@/components/split-editor/mobile/MobileBottomNav';
import type { MusicProviderId } from '@/lib/music-provider/types';

function usePanelSortBindings({
  panelId,
  sortKey,
  sortDirection,
  setSort,
}: {
  panelId: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
  setSort: (panelId: string, key: SortKey, direction: SortDirection) => void;
}) {
  const setSortKey = useCallback(
    (key: SortKey) => {
      setSort(panelId, key, sortDirection);
    },
    [panelId, setSort, sortDirection]
  );

  const setSortDirection = useCallback(
    (dir: SortDirection) => {
      setSort(panelId, sortKey, dir);
    },
    [panelId, setSort, sortKey]
  );

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSort(panelId, key, sortDirection === 'asc' ? 'desc' : 'asc');
        return;
      }

      setSort(panelId, key, 'asc');
    },
    [panelId, setSort, sortDirection, sortKey]
  );

  return {
    setSortKey,
    setSortDirection,
    handleSort,
  };
}

function usePanelActionBindings({
  panelId,
  providerId,
  playlistId,
  dndMode,
  isPhone,
  activeOverlay,
  setActiveOverlay,
  closePanel,
  splitPanel,
  setPanelDnDMode,
  togglePanelLock,
  selectPlaylist,
  setPanelProvider,
}: {
  panelId: string;
  providerId: MusicProviderId;
  playlistId: string | null | undefined;
  dndMode: 'move' | 'copy';
  isPhone: boolean;
  activeOverlay: MobileOverlay;
  setActiveOverlay: (overlay: MobileOverlay) => void;
  closePanel: (panelId: string) => void;
  splitPanel: (panelId: string, orientation: 'horizontal' | 'vertical') => void;
  setPanelDnDMode: (panelId: string, mode: 'move' | 'copy') => void;
  togglePanelLock: (panelId: string) => void;
  selectPlaylist: (panelId: string, playlistId: string, providerId?: MusicProviderId) => void;
  setPanelProvider: (panelId: string, providerId: MusicProviderId) => void;
}) {
  const handleSearchChange = useCallback(
    (query: string, setSearch: (panelId: string, query: string) => void) => setSearch(panelId, query),
    [panelId]
  );

  const handleReload = useCallback(() => {
    if (playlistId) {
      eventBus.emit('playlist:reload', { playlistId, providerId });
    }
  }, [playlistId, providerId]);

  const handleClose = useCallback(() => {
    if (isPhone && activeOverlay === 'panel2') {
      setActiveOverlay('none');
      return;
    }

    closePanel(panelId);
  }, [activeOverlay, closePanel, isPhone, panelId, setActiveOverlay]);

  const handleSplitHorizontal = useCallback(() => splitPanel(panelId, 'horizontal'), [panelId, splitPanel]);
  const handleSplitVertical = useCallback(() => splitPanel(panelId, 'vertical'), [panelId, splitPanel]);

  const handleDndModeToggle = useCallback(() => {
    setPanelDnDMode(panelId, dndMode === 'move' ? 'copy' : 'move');
  }, [dndMode, panelId, setPanelDnDMode]);

  const handleLockToggle = useCallback(() => togglePanelLock(panelId), [panelId, togglePanelLock]);

  const handleLoadPlaylist = useCallback(
    (newPlaylistId: string) => {
      selectPlaylist(panelId, newPlaylistId, providerId);
    },
    [panelId, providerId, selectPlaylist]
  );

  const handleProviderChange = useCallback(
    (nextProviderId: MusicProviderId) => {
      setPanelProvider(panelId, nextProviderId);
    },
    [panelId, setPanelProvider]
  );

  return {
    handleSearchChange,
    handleReload,
    handleClose,
    handleSplitHorizontal,
    handleSplitVertical,
    handleDndModeToggle,
    handleLockToggle,
    handleLoadPlaylist,
    handleProviderChange,
  };
}

const toSearchQuery = (value: string | undefined): string => value ?? '';
const toSelection = (value: Set<string> | undefined): Set<string> => value ?? new Set<string>();
const toLocked = (value: boolean | undefined): boolean => value ?? false;
const toSortKey = (value: SortKey | undefined): SortKey => value ?? 'position';
const toSortDirection = (value: SortDirection | undefined): SortDirection => value ?? 'asc';
const toDndMode = (value: 'move' | 'copy' | undefined): 'move' | 'copy' => value ?? 'copy';

function derivePanelState(panel: {
  providerId?: MusicProviderId;
  playlistId?: string | null;
  searchQuery?: string;
  selection?: Set<string>;
  locked?: boolean;
  sortKey?: SortKey;
  sortDirection?: SortDirection;
  dndMode?: 'move' | 'copy';
  scrollOffset?: number;
} | undefined) {
  return {
    providerId: panel?.providerId ?? 'spotify',
    playlistId: panel?.playlistId,
    searchQuery: toSearchQuery(panel?.searchQuery),
    selection: toSelection(panel?.selection),
    locked: toLocked(panel?.locked),
    sortKey: toSortKey(panel?.sortKey),
    sortDirection: toSortDirection(panel?.sortDirection),
    storedDndMode: toDndMode(panel?.dndMode),
    scrollOffset: panel?.scrollOffset,
  };
}

export function usePanelStoreBindings(panelId: string, dndMode: 'move' | 'copy') {
  // Store selectors - using typed selectors for type safety
  const panel = useSplitGridStore(
    (state) => state.panels.find((p) => p.id === panelId)
  );
  const panelCount = useSplitGridStore((state) => state.panels.length);
  const setSearch = useSplitGridStore((state) => state.setSearch);
  const setSelection = useSplitGridStore((state) => state.setSelection);
  const toggleSelection = useSplitGridStore((state) => state.toggleSelection);
  const setScroll = useSplitGridStore((state) => state.setScroll);
  const closePanel = useSplitGridStore((state) => state.closePanel);
  const splitPanel = useSplitGridStore((state) => state.splitPanel);
  const setPanelDnDMode = useSplitGridStore((state) => state.setPanelDnDMode);
  const setPanelProvider = useSplitGridStore((state) => state.setPanelProvider);
  const togglePanelLock = useSplitGridStore((state) => state.togglePanelLock);
  const loadPlaylist = useSplitGridStore((state) => state.loadPlaylist);
  const selectPlaylist = useSplitGridStore((state) => state.selectPlaylist);
  const setSort = useSplitGridStore((state) => state.setSort);

  // Mobile overlay state
  const { isPhone } = useDeviceType();
  const activeOverlay = useMobileOverlayStore((s) => s.activeOverlay);
  const setActiveOverlay = useMobileOverlayStore((s) => s.setActiveOverlay);

  const {
    providerId,
    playlistId,
    searchQuery,
    selection,
    locked,
    sortKey,
    sortDirection,
    storedDndMode,
    scrollOffset,
  } = derivePanelState(panel);

  const { setSortKey, setSortDirection, handleSort } = usePanelSortBindings({
    panelId,
    sortKey,
    sortDirection,
    setSort,
  });

  const {
    handleSearchChange: handleSearchChangeWithStore,
    handleReload,
    handleClose,
    handleSplitHorizontal,
    handleSplitVertical,
    handleDndModeToggle,
    handleLockToggle,
    handleLoadPlaylist,
    handleProviderChange,
  } = usePanelActionBindings({
    panelId,
    providerId,
    playlistId,
    dndMode,
    isPhone,
    activeOverlay,
    setActiveOverlay,
    closePanel,
    splitPanel,
    setPanelDnDMode,
    togglePanelLock,
    selectPlaylist,
    setPanelProvider,
  });

  const handleSearchChange = useCallback(
    (query: string) => handleSearchChangeWithStore(query, setSearch),
    [handleSearchChangeWithStore, setSearch]
  );

  return {
    // Panel state
    panel,
    panelCount,
    providerId,
    playlistId,
    searchQuery,
    selection,
    locked,
    sortKey,
    sortDirection,
    storedDndMode,
    scrollOffset,

    // Store setters
    setSelection,
    toggleSelection,
    setScroll,
    setSort,
    loadPlaylist,
    setSortKey,
    setSortDirection,
    setPanelDnDMode,

    // Handlers
    handleSearchChange,
    handleReload,
    handleClose,
    handleSplitHorizontal,
    handleSplitVertical,
    handleDndModeToggle,
    handleLockToggle,
    handleLoadPlaylist,
    handleProviderChange,
    handleSort,
  };
}
