/**
 * PanelToolbar component for individual playlist panels.
 * Includes search, reload, lock indicator, close, and playlist selector.
 * Uses AdaptiveNav for action buttons with automatic overflow handling.
 * 
 * Note: Track-level actions (delete, add to markers) are now in the TrackContextMenu.
 */

'use client';

import { useState, useRef, useEffect, ChangeEvent, useCallback, useMemo } from 'react';
import { 
  Search, 
  RefreshCw, 
  Lock, 
  LockOpen, 
  X, 
  SplitSquareHorizontal, 
  SplitSquareVertical, 
  Move, 
  Copy, 
  MapPinOff, 
  Pencil, 
  Loader2, 
  Save, 
  Play,
  Eraser,
  ListChecks,
} from 'lucide-react';
import { PlaylistSelector } from './PlaylistSelector';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlaylistDialog } from '@/components/playlist/PlaylistDialog';
import { AdaptiveNav, type NavItem } from '@/components/ui/adaptive-nav';
import { useUpdatePlaylist } from '@/lib/spotify/playlistMutations';
import { useDeviceType } from '@/hooks/useDeviceType';
import { isLikedSongsPlaylist } from '@/hooks/useLikedVirtualPlaylist';
import { cn } from '@/lib/utils';
import type { SortKey, SortDirection } from '@/hooks/usePlaylistSort';

/** Minimum width (in px) to show full toolbar - below this, use ultra-compact mode */
const ULTRA_COMPACT_BREAKPOINT = 280;
/** Minimum width to allow horizontal split */
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
  /** Whether the playlist has tracks */
  hasTracks?: boolean;
  /** Whether duplicate removal is in progress */
  isDeletingDuplicates?: boolean;
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
  onPlayFirst?: () => void;
  onDeleteDuplicates?: () => void;
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
  hasTracks = false,
  isDeletingDuplicates = false,
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
}: PanelToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
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

  // Track toolbar width for ultra-compact mode and split constraints
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
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

  // Ultra-compact dropdown header with search only
  const ultraCompactHeader = useMemo(() => {
    if (!isUltraCompact || !playlistId) return undefined;
    
    return (
      <>
        {/* Search */}
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
      </>
    );
  }, [isUltraCompact, playlistId, localSearch, handleSearchChange]);

  // Build toolbar actions array using NavItem format
  const navItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [];

    // Selection actions (first, so it appears leftmost in the right-aligned group)
    // Always visible with neverOverflow - this is the most important action
    if (playlistId && onOpenSelectionMenu) {
      items.push({
        id: 'selection',
        icon: <ListChecks className="h-4 w-4" />,
        label: selectionCount > 0 ? `${selectionCount} selected` : 'No selection',
        title: selectionCount > 0 ? `${selectionCount} track${selectionCount !== 1 ? 's' : ''} selected - click for actions` : 'No tracks selected',
        group: 'selection',
        disabled: selectionCount === 0,
        neverOverflow: true,
        customRender: () => (
          <Button
            ref={selectionButtonRef as React.RefObject<HTMLButtonElement>}
            variant="ghost"
            size="sm"
            onClick={() => {
              const rect = selectionButtonRef.current?.getBoundingClientRect();
              if (rect) {
                onOpenSelectionMenu({ x: rect.left, y: rect.bottom + 4 });
              }
            }}
            disabled={selectionCount === 0}
            className={cn(
              "h-7 px-1.5 shrink-0 gap-1",
              selectionCount > 0 ? "text-foreground hover:text-foreground" : "text-muted-foreground"
            )}
            title={selectionCount > 0 
              ? `${selectionCount} track${selectionCount !== 1 ? 's' : ''} selected - click for actions`
              : 'No tracks selected'
            }
          >
            <ListChecks className="h-4 w-4" />
            {selectionCount > 0 && (
              <span className="text-sm font-semibold text-orange-500 tabular-nums">
                {selectionCount}
              </span>
            )}
          </Button>
        ),
      });
    }

    // === PLAYLIST OPTIONS GROUP ===
    
    // Play playlist
    if (playlistId && hasTracks && onPlayFirst) {
      items.push({
        id: 'play',
        icon: <Play className="h-4 w-4" />,
        label: 'Play',
        onClick: onPlayFirst,
        title: 'Play playlist',
        group: 'playlist',
      });
    }

    // Edit Playlist Info
    if (canEditPlaylistInfo) {
      items.push({
        id: 'edit',
        icon: <Pencil className="h-4 w-4" />,
        label: 'Edit playlist',
        onClick: () => setEditDialogOpen(true),
        title: 'Edit playlist info',
        group: 'playlist',
      });
    }

    // Reload
    if (playlistId) {
      items.push({
        id: 'reload',
        icon: <RefreshCw className="h-4 w-4" />,
        label: isReloading ? 'Reloading…' : 'Reload playlist',
        onClick: onReload,
        disabled: isReloading,
        loading: isReloading,
        title: isReloading ? 'Reloading…' : 'Reload playlist',
        group: 'playlist',
      });
    }

    // === TRACK OPTIONS GROUP ===

    // DnD Mode Toggle (Copy mode)
    if (playlistId && isEditable && !locked) {
      items.push({
        id: 'dnd-mode',
        icon: dndMode === 'move' ? <Move className="h-4 w-4" /> : <Copy className="h-4 w-4" />,
        label: dndMode === 'move' ? 'Move mode' : 'Copy mode',
        onClick: onDndModeToggle,
        title: dndMode === 'move' ? 'Mode: Move (click to switch to Copy)' : 'Mode: Copy (click to switch to Move)',
        group: 'tracks',
      });
    }

    // Delete duplicates
    if (playlistId && isEditable && !locked && hasTracks && onDeleteDuplicates) {
      items.push({
        id: 'delete-duplicates',
        icon: isDeletingDuplicates 
          ? <Loader2 className="h-4 w-4" /> 
          : <Eraser className="h-4 w-4" />,
        label: isDeletingDuplicates ? 'Removing duplicates...' : 'Delete duplicates',
        onClick: onDeleteDuplicates,
        disabled: isDeletingDuplicates,
        loading: isDeletingDuplicates,
        title: 'Delete duplicates',
        group: 'tracks',
      });
    }

    // Save Current Order
    if (playlistId && isEditable && !locked && isSorted && onSaveCurrentOrder) {
      items.push({
        id: 'save-order',
        icon: isSavingOrder ? <Loader2 className="h-4 w-4" /> : <Save className="h-4 w-4" />,
        label: 'Save current order',
        onClick: onSaveCurrentOrder,
        disabled: isSavingOrder,
        loading: isSavingOrder,
        title: 'Save current order',
        group: 'tracks',
      });
    }

    // Clear Insertion Markers
    if (playlistId && isEditable && !locked && insertionMarkerCount > 0 && onClearInsertionMarkers) {
      items.push({
        id: 'clear-markers',
        icon: <MapPinOff className="h-4 w-4" />,
        label: `Clear ${insertionMarkerCount} marker${insertionMarkerCount > 1 ? 's' : ''}`,
        onClick: onClearInsertionMarkers,
        variant: 'warning',
        badge: (
          <span className="text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
            {insertionMarkerCount}
          </span>
        ),
        title: `Clear ${insertionMarkerCount} insertion marker${insertionMarkerCount > 1 ? 's' : ''}`,
        group: 'tracks',
      });
    }

    // === PANEL ACTIONS GROUP ===

    // Lock Toggle
    if (playlistId) {
      items.push({
        id: 'lock',
        icon: locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />,
        label: locked ? 'Unlock panel' : 'Lock panel',
        onClick: onLockToggle,
        disabled: !isEditable,
        title: locked ? 'Unlock panel' : 'Lock panel',
        group: 'panel',
      });
    }

    // Split commands (desktop only)
    if (showSplitCommands) {
      items.push({
        id: 'split-horizontal',
        icon: <SplitSquareHorizontal className="h-4 w-4" />,
        label: canSplitHorizontal ? 'Split horizontal' : 'Split horizontal (too narrow)',
        onClick: onSplitHorizontal,
        disabled: !canSplitHorizontal,
        title: canSplitHorizontal ? 'Split horizontal' : 'Panel too narrow to split',
        group: 'panel',
      });

      items.push({
        id: 'split-vertical',
        icon: <SplitSquareVertical className="h-4 w-4" />,
        label: 'Split vertical',
        onClick: onSplitVertical,
        title: 'Split vertical',
        group: 'panel',
      });
    }

    // === CLOSE GROUP (separate) ===
    
    // Close - always last, in its own group
    items.push({
      id: 'close',
      icon: <X className="h-4 w-4" />,
      label: isPhone ? 'Hide panel' : (isLastPanel ? 'Close panel (last)' : 'Close panel'),
      onClick: onClose,
      disabled: disableClose,
      title: isPhone ? 'Hide panel' : (isLastPanel ? 'Cannot close last panel' : 'Close panel'),
      group: 'close',
    });

    return items;
  }, [
    playlistId, hasTracks, onPlayFirst, isEditable, locked, onDeleteDuplicates, isDeletingDuplicates,
    isReloading, onReload, dndMode, onDndModeToggle, onLockToggle, canEditPlaylistInfo,
    isSorted, onSaveCurrentOrder, isSavingOrder, insertionMarkerCount, onClearInsertionMarkers,
    showSplitCommands, canSplitHorizontal, onSplitHorizontal, onSplitVertical,
    isPhone, isLastPanel, onClose, disableClose, selectionCount, onOpenSelectionMenu, isUltraCompact
  ]);

  return (
    <div ref={toolbarRef} className="flex items-center gap-1.5 p-1.5 border-b border-border bg-card relative z-30">
      {/* Playlist selector - always visible */}
      <div className="flex-1 min-w-0 max-w-[280px]">
        <PlaylistSelector
          selectedPlaylistId={playlistId}
          selectedPlaylistName={playlistName ?? ''}
          onSelectPlaylist={onLoadPlaylist}
        />
      </div>

      {/* Search - only in normal mode */}
      {playlistId && !isUltraCompact && (
        <div className="relative flex-1 min-w-0 max-w-[280px]">
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

      {/* AdaptiveNav handles all actions with automatic overflow - aligned right */}
      <AdaptiveNav
        items={navItems}
        displayMode="icon-only"
        layoutMode="horizontal"
        dropdownHeader={ultraCompactHeader}
        className="flex-1 min-w-0 justify-end"
      />

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
