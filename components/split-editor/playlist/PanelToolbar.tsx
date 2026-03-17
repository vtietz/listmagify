'use client';

import { useRef } from 'react';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useAutoScrollPlayStore, useHydratedAutoScrollPlay } from '@/hooks/useAutoScrollPlayStore';
import {
  type PanelToolbarProps,
  type ResolvedPanelToolbarProps,
  useToolbarLayoutState,
  useToolbarSearch,
  usePlaylistEditState,
  useToolbarNavItems,
  useUltraCompactHeader,
  PanelToolbarContent,
  resolvePanelToolbarProps,
} from './panelToolbarHelpers';

export type { PanelToolbarProps } from './panelToolbarHelpers';

function PanelToolbarInner({
  panelId: _panelId,
  playlistId,
  playlistName,
  playlistDescription,
  playlistIsPublic,
  isEditable,
  locked,
  dndMode,
  searchQuery,
  isReloading,
  sortKey: _sortKey,
  sortDirection: _sortDirection,
  insertionMarkerCount,
  isSorted,
  isSavingOrder,
  selectionCount,
  onOpenSelectionMenu,
  onClearSelection: _onClearSelection,
  panelCount,
  hasTracks,
  hasDuplicates,
  isDeletingDuplicates,
  isPlayingPanel,
  onSearchChange,
  onSortChange: _onSortChange,
  onReload,
  onClose,
  onSplitHorizontal,
  onSplitVertical,
  onDndModeToggle,
  onLockToggle,
  onLoadPlaylist,
  onClearInsertionMarkers,
  onSaveCurrentOrder,
  onPlayFirst,
  onDeleteDuplicates,
}: ResolvedPanelToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { isUltraCompact, canSplitHorizontal } = useToolbarLayoutState(toolbarRef);

  const { localSearch, handleSearchChange } = useToolbarSearch(onSearchChange, searchQuery);
  const {
    displayPlaylistName,
    setEditDialogOpen,
    editDialog,
    canEditPlaylistInfo,
  } = usePlaylistEditState({
    playlistId,
    playlistName,
    playlistDescription,
    playlistIsPublic,
    isEditable,
  });
  const { isPhone } = useDeviceType();
  const autoScrollEnabled = useHydratedAutoScrollPlay();
  const toggleAutoScroll = useAutoScrollPlayStore((s) => s.toggle);

  const showSplitCommands = !isPhone;
  const isLastPanel = panelCount <= 1;
  const disableClose = !isPhone && isLastPanel;

  const navItems = useToolbarNavItems({
    playlistId,
    canEditPlaylistInfo,
    setEditDialogOpen,
    isReloading,
    onReload,
    hasTracks,
    onPlayFirst,
    isEditable,
    locked,
    panelCount,
    dndMode,
    onDndModeToggle,
    hasDuplicates,
    onDeleteDuplicates,
    isDeletingDuplicates,
    isSorted,
    onSaveCurrentOrder,
    isSavingOrder,
    insertionMarkerCount,
    onClearInsertionMarkers,
    autoScrollEnabled,
    toggleAutoScroll,
    onLockToggle,
    showSplitCommands,
    canSplitHorizontal,
    onSplitHorizontal,
    onSplitVertical,
    isPhone,
    isLastPanel,
    onClose,
    disableClose,
    onOpenSelectionMenu,
    selectionCount,
  });

  const ultraCompactHeader = useUltraCompactHeader({
    isUltraCompact,
    playlistId,
    localSearch,
    handleSearchChange,
    isPhone,
  });

  const showSearch = Boolean(playlistId && !isUltraCompact);

  return (
    <PanelToolbarContent
      toolbarRef={toolbarRef}
      isPlayingPanel={isPlayingPanel}
      playlistId={playlistId}
      displayPlaylistName={displayPlaylistName}
      onLoadPlaylist={onLoadPlaylist}
      showSearch={showSearch}
      localSearch={localSearch}
      handleSearchChange={handleSearchChange}
      isPhone={isPhone}
      navItems={navItems}
      ultraCompactHeader={ultraCompactHeader}
      editDialog={editDialog}
    />
  );
}

export function PanelToolbar(props: PanelToolbarProps) {
  return <PanelToolbarInner {...resolvePanelToolbarProps(props)} />;
}
