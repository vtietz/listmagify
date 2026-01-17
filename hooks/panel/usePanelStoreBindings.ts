/**
 * Hook for binding to the split grid store and providing panel operations.
 */

'use client';

import { useCallback } from 'react';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { useMobileOverlayStore } from '@/components/split-editor/MobileBottomNav';
import { useDeviceType } from '@/hooks/useDeviceType';
import { eventBus } from '@/lib/sync/eventBus';
import type { SortKey, SortDirection } from '@/lib/utils/sort';

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
  const togglePanelLock = useSplitGridStore((state) => state.togglePanelLock);
  const loadPlaylist = useSplitGridStore((state) => state.loadPlaylist);
  const selectPlaylist = useSplitGridStore((state) => state.selectPlaylist);
  const setSort = useSplitGridStore((state) => state.setSort);

  // Mobile overlay state
  const { isPhone } = useDeviceType();
  const activeOverlay = useMobileOverlayStore((s) => s.activeOverlay);
  const setActiveOverlay = useMobileOverlayStore((s) => s.setActiveOverlay);

  // Panel state from store
  const playlistId = panel?.playlistId;
  const searchQuery = panel?.searchQuery || '';
  const selection = panel?.selection || new Set<string>();
  const locked = panel?.locked || false;
  const sortKey: SortKey = panel?.sortKey || 'position';
  const sortDirection: SortDirection = panel?.sortDirection || 'asc';
  const storedDndMode = panel?.dndMode || 'copy';
  const scrollOffset = panel?.scrollOffset;

  // Sort setters
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

  // Handlers
  const handleSearchChange = useCallback(
    (query: string) => setSearch(panelId, query),
    [panelId, setSearch]
  );

  const handleReload = useCallback(() => {
    if (playlistId) eventBus.emit('playlist:reload', { playlistId });
  }, [playlistId]);

  const handleClose = useCallback(() => {
    if (isPhone && activeOverlay === 'panel2') {
      setActiveOverlay('none');
    } else {
      closePanel(panelId);
    }
  }, [isPhone, activeOverlay, setActiveOverlay, closePanel, panelId]);

  const handleSplitHorizontal = useCallback(
    () => splitPanel(panelId, 'horizontal'),
    [panelId, splitPanel]
  );

  const handleSplitVertical = useCallback(
    () => splitPanel(panelId, 'vertical'),
    [panelId, splitPanel]
  );

  const handleDndModeToggle = useCallback(() => {
    setPanelDnDMode(panelId, dndMode === 'move' ? 'copy' : 'move');
  }, [panelId, dndMode, setPanelDnDMode]);

  const handleLockToggle = useCallback(
    () => togglePanelLock(panelId),
    [panelId, togglePanelLock]
  );

  const handleLoadPlaylist = useCallback(
    (newPlaylistId: string) => {
      selectPlaylist(panelId, newPlaylistId);
    },
    [panelId, selectPlaylist]
  );

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSort(panelId, key, sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setSort(panelId, key, 'asc');
      }
    },
    [panelId, sortKey, sortDirection, setSort]
  );

  return {
    // Panel state
    panel,
    panelCount,
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
    handleSort,
  };
}
