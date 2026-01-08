/**
 * PanelToolbar component for individual playlist panels.
 * Includes search, reload, lock indicator, close, and playlist selector.
 * Shows inline buttons when panel is wide (≥600px), collapses to dropdown menu when narrow.
 * 
 * Note: Track-level actions (delete, add to markers) are now in the TrackContextMenu.
 */

'use client';

import { useState, useRef, useEffect, ChangeEvent, useCallback } from 'react';
import { Search, RefreshCw, Lock, LockOpen, X, SplitSquareHorizontal, SplitSquareVertical, Move, Copy, MoreHorizontal, MapPinOff, Pencil, Loader2, Save, ListChecks } from 'lucide-react';
import { PlaylistSelector } from './PlaylistSelector';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PlaylistDialog } from '@/components/playlist/PlaylistDialog';
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
  panelId,
  playlistId,
  playlistName,
  playlistDescription,
  isEditable,
  locked,
  dndMode,
  searchQuery,
  isReloading = false,
  sortKey = 'position',
  sortDirection = 'asc',
  insertionMarkerCount = 0,
  isSorted = false,
  isSavingOrder = false,
  selectionCount = 0,
  onOpenSelectionMenu,
  onClearSelection,
  onSearchChange,
  onSortChange,
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
  const canEditPlaylistInfo = playlistId && isEditable && !isLiked;
  
  // On mobile, hide split commands (use bottom nav panel toggle instead)
  const showSplitCommands = !isPhone;

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
        <Button
          ref={selectionButtonRef}
          variant="ghost"
          size="sm"
          onClick={handleSelectionMenuClick}
          disabled={selectionCount === 0}
          className={cn(
            "h-8 px-2 shrink-0 gap-1",
            selectionCount > 0 ? "text-foreground hover:text-foreground" : "text-muted-foreground"
          )}
          title={selectionCount > 0 
            ? `${selectionCount} track${selectionCount > 1 ? 's' : ''} selected - click for actions`
            : 'No tracks selected'
          }
        >
          <ListChecks className="h-4 w-4" />
          {selectionCount > 1 && (
            <span className="text-xs font-medium bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
              {selectionCount}
            </span>
          )}
        </Button>
      )}

      {/* Inline buttons when panel is wide enough */}
      {!isCompact && (
        <>
          {/* Reload */}
          {playlistId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReload}
              disabled={isReloading}
              className="h-8 w-8 p-0 shrink-0"
              title={isReloading ? 'Reloading…' : 'Reload playlist'}
            >
              <RefreshCw className={cn('h-4 w-4', isReloading && 'animate-spin')} />
            </Button>
          )}

          {/* DnD Mode Toggle */}
          {playlistId && isEditable && !locked && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDndModeToggle}
              className="h-8 w-8 p-0 shrink-0"
              title={dndMode === 'move' ? 'Mode: Move (click to switch to Copy)' : 'Mode: Copy (click to switch to Move)'}
            >
              {dndMode === 'move' ? <Move className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          )}

          {/* Lock Toggle */}
          {playlistId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onLockToggle}
              disabled={!isEditable}
              className="h-8 w-8 p-0 shrink-0"
              title={locked ? 'Unlock panel' : 'Lock panel'}
            >
              {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            </Button>
          )}

          {/* Edit Playlist Info */}
          {canEditPlaylistInfo && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditDialogOpen(true)}
              className="h-8 w-8 p-0 shrink-0"
              title="Edit playlist info"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}

          {/* Save Current Order - visible when sorted in non-default order */}
          {playlistId && isEditable && !locked && isSorted && onSaveCurrentOrder && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSaveCurrentOrder}
              disabled={isSavingOrder}
              className="h-8 w-8 p-0 shrink-0"
              title="Save current order"
            >
              {isSavingOrder ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Clear Insertion Markers */}
          {playlistId && isEditable && !locked && insertionMarkerCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearInsertionMarkers}
              className="h-8 w-8 p-0 shrink-0 text-orange-500 hover:text-orange-600"
              title={`Clear ${insertionMarkerCount} insertion marker${insertionMarkerCount > 1 ? 's' : ''}`}
            >
              <MapPinOff className="h-4 w-4" />
            </Button>
          )}

          {/* Split commands - hidden on mobile (use bottom nav instead) */}
          {showSplitCommands && (
            <>
              <Separator orientation="vertical" className="h-6 mx-0.5" />

              {/* Split Horizontal - disabled if panel too narrow */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onSplitHorizontal}
                disabled={!canSplitHorizontal}
                className={cn("h-8 w-8 p-0 shrink-0", !canSplitHorizontal && "opacity-40")}
                title={canSplitHorizontal ? "Split horizontal" : "Panel too narrow to split"}
              >
                <SplitSquareHorizontal className="h-4 w-4" />
              </Button>

              {/* Split Vertical */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onSplitVertical}
                className="h-8 w-8 p-0 shrink-0"
                title="Split vertical"
              >
                <SplitSquareVertical className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Close */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 shrink-0"
            title="Close panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </>
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
            {/* Ultra-compact mode: Playlist selector in dropdown */}
            {isUltraCompact && (
              <>
                <div className="px-2 py-1.5">
                  <PlaylistSelector
                    selectedPlaylistId={playlistId}
                    selectedPlaylistName={playlistName ?? ''}
                    onSelectPlaylist={onLoadPlaylist}
                  />
                </div>
                {playlistId && (
                  <div className="px-2 py-1.5">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="text"
                        placeholder="Search..."
                        value={localSearch}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value)}
                        className="pl-9 h-8 text-sm"
                      />
                    </div>
                  </div>
                )}
                <DropdownMenuSeparator />
              </>
            )}

            {/* Selection Actions - in ultra-compact mode */}
            {isUltraCompact && playlistId && onOpenSelectionMenu && (
              <>
                <DropdownMenuItem
                  onClick={selectionCount > 0 ? handleSelectionMenuClick : undefined}
                  disabled={selectionCount === 0}
                >
                  <ListChecks className="h-4 w-4 mr-2" />
                  Selection actions
                  {selectionCount > 0 && (
                    <span className="text-xs font-medium bg-orange-500 text-white px-1.5 py-0.5 rounded-full ml-auto">
                      {selectionCount}
                    </span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Reload */}
            {playlistId && (
              <DropdownMenuItem onClick={onReload} disabled={isReloading}>
                <RefreshCw className={cn('h-4 w-4 mr-2', isReloading && 'animate-spin')} />
                {isReloading ? 'Reloading…' : 'Reload playlist'}
              </DropdownMenuItem>
            )}

            {/* DnD Mode Toggle */}
            {playlistId && isEditable && !locked && (
              <DropdownMenuItem onClick={onDndModeToggle}>
                {dndMode === 'move' ? (
                  <>
                    <Move className="h-4 w-4 mr-2" />
                    Mode: Move
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Mode: Copy
                  </>
                )}
              </DropdownMenuItem>
            )}

            {/* Lock Toggle */}
            {playlistId && (
              <DropdownMenuItem onClick={onLockToggle} disabled={!isEditable}>
                {locked ? (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Unlock panel
                  </>
                ) : (
                  <>
                    <LockOpen className="h-4 w-4 mr-2" />
                    Lock panel
                  </>
                )}
              </DropdownMenuItem>
            )}

            {/* Edit Playlist Info */}
            {canEditPlaylistInfo && (
              <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit playlist info
              </DropdownMenuItem>
            )}

            {/* Save Current Order - visible when sorted in non-default order */}
            {playlistId && isEditable && !locked && isSorted && onSaveCurrentOrder && (
              <DropdownMenuItem 
                onClick={onSaveCurrentOrder}
                disabled={isSavingOrder}
              >
                {isSavingOrder ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save current order
              </DropdownMenuItem>
            )}

            {/* Clear Insertion Markers */}
            {playlistId && isEditable && !locked && insertionMarkerCount > 0 && (
              <DropdownMenuItem onClick={onClearInsertionMarkers} className="text-orange-500 focus:text-orange-600">
                <MapPinOff className="h-4 w-4 mr-2" />
                Clear {insertionMarkerCount} marker{insertionMarkerCount > 1 ? 's' : ''}
              </DropdownMenuItem>
            )}

            {playlistId && <DropdownMenuSeparator />}

            {/* Split actions - hidden on mobile (use bottom nav instead) */}
            {showSplitCommands && (
              <>
                <DropdownMenuItem 
                  onClick={canSplitHorizontal ? onSplitHorizontal : undefined}
                  disabled={!canSplitHorizontal}
                  className={cn(!canSplitHorizontal && "opacity-40 cursor-not-allowed")}
                >
                  <SplitSquareHorizontal className="h-4 w-4 mr-2" />
                  Split horizontal
                  {!canSplitHorizontal && <span className="text-xs text-muted-foreground ml-auto">(too narrow)</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSplitVertical}>
                  <SplitSquareVertical className="h-4 w-4 mr-2" />
                  Split vertical
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Close */}
            <DropdownMenuItem onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Close panel
            </DropdownMenuItem>
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
