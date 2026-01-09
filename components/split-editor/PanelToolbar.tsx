/**
 * PanelToolbar component for individual playlist panels.
 * Includes search, reload, lock indicator, close, and playlist selector.
 * Shows inline buttons when panel is wide (≥600px), collapses to dropdown menu when narrow.
 * 
 * Note: Track-level actions (delete, add to markers) are now in the TrackContextMenu.
 */

'use client';

import { useState, useRef, useEffect, ChangeEvent, useCallback } from 'react';
import { Search, MoreHorizontal } from 'lucide-react';
import { PlaylistSelector } from './PlaylistSelector';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PlaylistDialog } from '@/components/playlist/PlaylistDialog';
import { InlineToolbarActions, DropdownToolbarActions, SelectionButton } from './PanelToolbarActions';
import { useUpdatePlaylist } from '@/lib/spotify/playlistMutations';
import { useDeviceType } from '@/hooks/useDeviceType';
import { isLikedSongsPlaylist } from '@/hooks/useLikedVirtualPlaylist';
import { cn } from '@/lib/utils';
import type { SortKey, SortDirection } from '@/hooks/usePlaylistSort';

/** Minimum width (in px) to show inline buttons instead of dropdown menu */
const COMPACT_BREAKPOINT = 600;
/** Minimum width (in px) to show full toolbar - below this, use ultra-compact mode */
const ULTRA_COMPACT_BREAKPOINT = 280;
/** Minimum width to allow horizontal split (need at least ULTRA_COMPACT_BREAKPOINT) */
const MIN_SPLIT_WIDTH = ULTRA_COMPACT_BREAKPOINT;

interface PanelToolbarProps {
  panelId: string;
  playlistId: string | null;
  playlistName?: string;
  playlistDescription?: string;
  isEditable: boolean;
  locked: boolean;
  dndMode: 'move' | 'copy';
  searchQuery: string;
  isReloading?: boolean;
  sortKey?: SortKey;
  sortDirection?: SortDirection;
  insertionMarkerCount?: number;
  /** Whether the playlist is sorted in non-default order (can save current order) */
  isSorted?: boolean;
  /** Whether saving current order is in progress */
  isSavingOrder?: boolean;
  /** Number of selected tracks in this panel */
  selectionCount?: number;
  /** Callback to open selection actions menu */
  onOpenSelectionMenu?: (position: { x: number; y: number }) => void;
  /** Callback to clear selection */
  onClearSelection?: () => void;
  /** Total number of panels (to disable close button when last panel) */
  panelCount?: number;
  onSearchChange: (query: string) => void;
  onSortChange?: (key: SortKey, direction: SortDirection) => void;
  onReload: () => void;
  onClose: () => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onDndModeToggle: () => void;
  onLockToggle: () => void;
  onLoadPlaylist: (playlistId: string) => void;
  onClearInsertionMarkers?: () => void;
  onSaveCurrentOrder?: () => void;
}

export function PanelToolbar({
  panelId: _panelId,
  playlistId,
  playlistName,
  playlistDescription,
  isEditable,
  locked,
  dndMode,
  searchQuery,
  isReloading = false,
  sortKey: _sortKey = 'position',
  sortDirection: _sortDirection = 'asc',
  insertionMarkerCount = 0,
  isSorted = false,
  isSavingOrder = false,
  selectionCount = 0,
  onOpenSelectionMenu,
  onClearSelection: _onClearSelection,
  panelCount = 1,
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
}: PanelToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [isCompact, setIsCompact] = useState(true);
  const [isUltraCompact, setIsUltraCompact] = useState(false);
  const [canSplitHorizontal, setCanSplitHorizontal] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const selectionButtonRef = useRef<HTMLButtonElement>(null);
  
  const updatePlaylist = useUpdatePlaylist();
  const { isPhone } = useDeviceType();
  const isLiked = playlistId ? isLikedSongsPlaylist(playlistId) : false;
  const canEditPlaylistInfo = !!(playlistId && isEditable && !isLiked);
  
  // On mobile, hide split commands (use bottom nav panel toggle instead)
  const showSplitCommands = !isPhone;
  
  // Disable close button when it's the last panel (desktop)
  // On mobile, close means hide (like Panel 2 toggle), so never disable
  const isLastPanel = panelCount <= 1;
  const disableClose = !isPhone && isLastPanel;

  // Track toolbar width to toggle between compact (dropdown) and expanded (inline buttons) mode
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        setIsCompact(width < COMPACT_BREAKPOINT);
        setIsUltraCompact(width < ULTRA_COMPACT_BREAKPOINT);
        setCanSplitHorizontal(width >= MIN_SPLIT_WIDTH);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    onSearchChange(value);
  };

  const handleUpdatePlaylist = useCallback(async (values: { name: string; description: string }) => {
    if (!playlistId) return;
    await updatePlaylist.mutateAsync({
      playlistId,
      name: values.name,
      description: values.description,
    });
  }, [playlistId, updatePlaylist]);

  const handleSelectionMenuClick = useCallback((e: React.MouseEvent) => {
    if (!onOpenSelectionMenu) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onOpenSelectionMenu({ x: rect.right, y: rect.bottom });
  }, [onOpenSelectionMenu]);

  return (
    <div ref={toolbarRef} className="flex items-center gap-1.5 p-1.5 border-b border-border bg-card relative z-30">
      {/* Playlist selector - hidden in ultra-compact mode (moved to dropdown) */}
      {!isUltraCompact && (
        <div className="shrink-0 max-w-[50%]">
          <PlaylistSelector
            selectedPlaylistId={playlistId}
            selectedPlaylistName={playlistName ?? ''}
            onSelectPlaylist={onLoadPlaylist}
          />
        </div>
      )}

      {/* Search - hidden in ultra-compact mode (moved to dropdown) */}
      {playlistId && !isUltraCompact && (
        <div className={cn("relative flex-1", isPhone ? "min-w-[40px]" : "min-w-[60px]")}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search..."
            value={localSearch}
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value)}
            className={cn("pl-9 h-9 text-sm", isPhone && "h-8")}
          />
        </div>
      )}

      {/* Ultra-compact mode: Show playlist name as text + expand button */}
      {isUltraCompact && (
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <span className="text-sm font-medium truncate">
            {playlistName || '(Select)'}
          </span>
        </div>
      )}

      {/* Selection Actions Button - always visible when playlist loaded, disabled when no selection */}
      {playlistId && onOpenSelectionMenu && !isUltraCompact && (
        <SelectionButton
          selectionCount={selectionCount}
          onClick={handleSelectionMenuClick}
          buttonRef={selectionButtonRef}
        />
      )}

      {/* Inline buttons when panel is wide enough */}
      {!isCompact && (
        <InlineToolbarActions
          playlistId={playlistId}
          playlistName={playlistName}
          isEditable={isEditable}
          locked={locked}
          dndMode={dndMode}
          isReloading={isReloading}
          isSorted={isSorted}
          isSavingOrder={isSavingOrder}
          insertionMarkerCount={insertionMarkerCount}
          canSplitHorizontal={canSplitHorizontal}
          disableClose={disableClose}
          isLastPanel={isLastPanel}
          isPhone={isPhone}
          showSplitCommands={showSplitCommands}
          canEditPlaylistInfo={canEditPlaylistInfo}
          onReload={onReload}
          onDndModeToggle={onDndModeToggle}
          onLockToggle={onLockToggle}
          onSplitHorizontal={onSplitHorizontal}
          onSplitVertical={onSplitVertical}
          onClose={onClose}
          onClearInsertionMarkers={onClearInsertionMarkers}
          onSaveCurrentOrder={onSaveCurrentOrder}
          onEditPlaylist={() => setEditDialogOpen(true)}
        />
      )}

      {/* Compact: Dropdown menu with all actions */}
      {isCompact && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              title="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-h-[70vh] overflow-y-auto">
            <DropdownToolbarActions
              playlistId={playlistId}
              playlistName={playlistName}
              isEditable={isEditable}
              locked={locked}
              dndMode={dndMode}
              isReloading={isReloading}
              isSorted={isSorted}
              isSavingOrder={isSavingOrder}
              insertionMarkerCount={insertionMarkerCount}
              selectionCount={selectionCount}
              canSplitHorizontal={canSplitHorizontal}
              disableClose={disableClose}
              isLastPanel={isLastPanel}
              isPhone={isPhone}
              showSplitCommands={showSplitCommands}
              canEditPlaylistInfo={canEditPlaylistInfo}
              isUltraCompact={isUltraCompact}
              localSearch={localSearch}
              onReload={onReload}
              onDndModeToggle={onDndModeToggle}
              onLockToggle={onLockToggle}
              onSplitHorizontal={onSplitHorizontal}
              onSplitVertical={onSplitVertical}
              onClose={onClose}
              onClearInsertionMarkers={onClearInsertionMarkers}
              onSaveCurrentOrder={onSaveCurrentOrder}
              onEditPlaylist={() => setEditDialogOpen(true)}
              onSelectionMenuClick={handleSelectionMenuClick}
              onSearchChange={handleSearchChange}
              onLoadPlaylist={onLoadPlaylist}
              onOpenSelectionMenu={onOpenSelectionMenu}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Edit playlist dialog */}
      {canEditPlaylistInfo && (
        <PlaylistDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          mode="edit"
          initialValues={{
            name: playlistName ?? '',
            description: playlistDescription ?? '',
          }}
          onSubmit={handleUpdatePlaylist}
          isSubmitting={updatePlaylist.isPending}
        />
      )}
    </div>
  );
}
