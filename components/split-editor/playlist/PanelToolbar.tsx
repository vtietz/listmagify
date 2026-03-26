'use client';

import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useDeviceType } from '@shared/hooks/useDeviceType';
import { useAutoScrollPlayStore, useHydratedAutoScrollPlay } from '@features/split-editor/hooks/useAutoScrollPlayStore';
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
} from '@features/split-editor/playlist/ui/panelToolbarHelpers';

export type { PanelToolbarProps } from '@features/split-editor/playlist/ui/panelToolbarHelpers';

function PanelToolbarInner({
  panelId: _panelId,
  providerId,
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
  onProviderChange,
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
    providerId,
    playlistId,
    playlistName,
    playlistDescription,
    playlistIsPublic,
    isEditable,
  });
  const { isPhone } = useDeviceType();
  const pathname = usePathname();
  const autoScrollEnabled = useHydratedAutoScrollPlay();
  const toggleAutoScroll = useAutoScrollPlayStore((s) => s.toggle);

  const showSplitCommands = !isPhone;
  const isLastPanel = panelCount <= 1;
  const isPlaylistDetailRoute = pathname.startsWith('/playlists/');
  const canCloseLastPanel = isPlaylistDetailRoute;
  const disableClose = !isPhone && isLastPanel && !canCloseLastPanel;
  const canPlayInProvider = providerId === 'spotify';

  const navItems = useToolbarNavItems({
    playlistId,
    canEditPlaylistInfo,
    setEditDialogOpen,
    isReloading,
    onReload,
    hasTracks,
    onPlayFirst: canPlayInProvider ? onPlayFirst : undefined,
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
    canCloseLastPanel,
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
      providerId={providerId}
      playlistId={playlistId}
      displayPlaylistName={displayPlaylistName}
      onProviderChange={onProviderChange}
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
