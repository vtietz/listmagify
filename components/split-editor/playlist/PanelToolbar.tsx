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
  ListChecks,
} from 'lucide-react';
import { PlaylistSelector } from './PlaylistSelector';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlaylistDialog } from '@/components/playlist/PlaylistDialog';
import { AdaptiveNav, type NavItem } from '@/components/ui/adaptive-nav';
import { buildPanelToolbarNavItems } from './panelToolbarNavItems';
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
  const [displayPlaylistName, setDisplayPlaylistName] = useState(playlistName ?? '');
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

  useEffect(() => {
    setDisplayPlaylistName(playlistName ?? '');
  }, [playlistName]);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);
    onSearchChange(value);
  }, [onSearchChange]);

  const handleUpdatePlaylist = useCallback(async (values: { name: string; description: string; isPublic: boolean }) => {
    if (!playlistId) return;
    const previousName = displayPlaylistName;
    setDisplayPlaylistName(values.name);

    try {
      await updatePlaylist.mutateAsync({
        playlistId,
        name: values.name,
        description: values.description,
        isPublic: values.isPublic,
      });
    } catch (error) {
      setDisplayPlaylistName(previousName);
      throw error;
    }
  }, [playlistId, updatePlaylist, displayPlaylistName]);

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

  const navItems: NavItem[] = useMemo(() => {
    const items = buildPanelToolbarNavItems({
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
    });

    if (playlistId && onOpenSelectionMenu) {
      items.unshift({
        id: 'selection',
        icon: <ListChecks className="h-4 w-4" />,
        label: selectionCount > 0 ? `${selectionCount} selected` : 'No selection',
        title: selectionCount > 0
          ? `${selectionCount} track${selectionCount !== 1 ? 's' : ''} selected - click for actions`
          : 'No tracks selected',
        group: 'selection',
        disabled: selectionCount === 0,
        neverOverflow: true,
        customRender: () => (
          <Button
            ref={selectionButtonRef}
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
              'h-7 px-1.5 shrink-0 gap-1',
              selectionCount > 0 ? 'text-foreground hover:text-foreground' : 'text-muted-foreground'
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

    return items;
  }, [
    playlistId,
    onOpenSelectionMenu,
    selectionCount,
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
              selectedPlaylistName={displayPlaylistName}
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
            name: displayPlaylistName,
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
