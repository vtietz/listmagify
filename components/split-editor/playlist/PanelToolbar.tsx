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
  ArrowDownToLine,
} from 'lucide-react';
import { PlaylistSelector } from './PlaylistSelector';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlaylistDialog } from '@/components/playlist/PlaylistDialog';
import { AdaptiveNav, type NavItem } from '@/components/ui/adaptive-nav';
import { PlayingIndicator } from '@/components/ui/playing-indicator';
import { useUpdatePlaylist } from '@/lib/spotify/playlistMutations';
import { useDeviceType } from '@/hooks/useDeviceType';
import { isLikedSongsPlaylist } from '@/hooks/useLikedVirtualPlaylist';
import { useAutoScrollPlayStore, useHydratedAutoScrollPlay } from '@/hooks/useAutoScrollPlayStore';
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
  playlistIsPublic?: boolean;
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
  /** Whether the playlist has duplicate tracks */
  hasDuplicates?: boolean;
  /** Whether duplicate removal is in progress */
  isDeletingDuplicates?: boolean;
  /** Whether this panel is the active playback source */
  isPlayingPanel?: boolean;
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
  playlistIsPublic,
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
  hasDuplicates = false,
  isDeletingDuplicates = false,
  isPlayingPanel = false,
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
  
  // Auto-scroll during playback toggle
  const autoScrollEnabled = useHydratedAutoScrollPlay();
  const toggleAutoScroll = useAutoScrollPlayStore((s) => s.toggle);
  
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

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);
    onSearchChange(value);
  }, [onSearchChange]);

  const handleUpdatePlaylist = useCallback(async (values: { name: string; description: string; isPublic: boolean }) => {
    if (!playlistId) return;
    await updatePlaylist.mutateAsync({
      playlistId,
      name: values.name,
      description: values.description,
      isPublic: values.isPublic,
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

    // === TRACK OPTIONS GROUP ===

    // DnD Mode Options (Move/Copy mode) - only show if multiple panels exist
    if (playlistId && isEditable && !locked && panelCount > 1) {
      // Move mode option
      items.push({
        id: 'move-mode',
        icon: <Move className="h-4 w-4" />,
        label: 'Move between panels',
        onClick: () => {
          if (dndMode !== 'move') {
            onDndModeToggle();
          }
        },
        title: 'When dragging tracks to another panel, move them (removes from source)',
        group: 'drag-mode',
        showCheckmark: true,
        isActive: dndMode === 'move',
      });
      
      // Copy mode option
      items.push({
        id: 'copy-mode',
        icon: <Copy className="h-4 w-4" />,
        label: 'Copy between panels',
        onClick: () => {
          if (dndMode !== 'copy') {
            onDndModeToggle();
          }
        },
        title: 'When dragging tracks to another panel, duplicate them (keeps in source)',
        group: 'drag-mode',
        showCheckmark: true,
        isActive: dndMode === 'copy',
      });
    }

    // Delete duplicates - only show when duplicates exist
    if (playlistId && isEditable && !locked && hasDuplicates && onDeleteDuplicates) {
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

    // Auto-scroll during playback toggle
    items.push({
      id: 'auto-scroll',
      icon: <ArrowDownToLine className="h-4 w-4" />,
      label: autoScrollEnabled ? 'Auto-scroll: On' : 'Auto-scroll: Off',
      onClick: toggleAutoScroll,
      showCheckmark: true,
      isActive: autoScrollEnabled,
      title: autoScrollEnabled 
        ? 'Auto-scroll during playback is enabled - click to disable' 
        : 'Enable auto-scroll to follow playing track',
      group: 'panel',
    });

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
    playlistId, hasTracks, onPlayFirst, isEditable, locked, onDeleteDuplicates, hasDuplicates, isDeletingDuplicates,
    isReloading, onReload, dndMode, onDndModeToggle, onLockToggle, canEditPlaylistInfo,
    isSorted, onSaveCurrentOrder, isSavingOrder, insertionMarkerCount, onClearInsertionMarkers,
    showSplitCommands, canSplitHorizontal, onSplitHorizontal, onSplitVertical,
    isPhone, isLastPanel, onClose, disableClose, selectionCount, onOpenSelectionMenu, panelCount,
    autoScrollEnabled, toggleAutoScroll
  ]);

  return (
    <div
      ref={toolbarRef}
      className="flex items-center gap-1 border-b border-border bg-card relative z-30"
    >
      
      {/* Playlist selector + search share available width - approx 50% */}
      <div className="flex flex-1 min-w-0 basis-0 items-center gap-1">
        {/* Playlist selector - always visible, with playing indicator */}
        <div className="flex-1 min-w-0 basis-0 flex items-center gap-2">
          {isPlayingPanel && <PlayingIndicator size="sm" className="ml-2 shrink-0" />}
          <div className="flex-1 min-w-0">
            <PlaylistSelector
              selectedPlaylistId={playlistId}
              selectedPlaylistName={playlistName ?? ''}
              onSelectPlaylist={onLoadPlaylist}
            />
          </div>
        </div>

        {/* Search - only in normal mode */}
        {playlistId && !isUltraCompact && (
          <div className="relative flex-1 min-w-0 basis-0">
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
      </div>

      {/* AdaptiveNav handles all actions with automatic overflow - aligned right, takes remaining ~50% */}
      <div className="flex flex-1 min-w-0 basis-0 justify-end">
        <AdaptiveNav
          items={navItems}
          displayMode="icon-only"
          layoutMode="horizontal"
          dropdownHeader={ultraCompactHeader}
          className="w-full"
        />
      </div>

      {/* Edit playlist dialog */}
      {canEditPlaylistInfo && (
        <PlaylistDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          mode="edit"
          initialValues={{
            name: playlistName ?? '',
            description: playlistDescription ?? '',
            isPublic: playlistIsPublic ?? false,
          }}
          onSubmit={handleUpdatePlaylist}
          isSubmitting={updatePlaylist.isPending}
        />
      )}
    </div>
  );
}
