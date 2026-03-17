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

function createSelectionNavItem({
  selectionCount,
  onOpenSelectionMenu,
}: {
  selectionCount: number;
  onOpenSelectionMenu: (position: { x: number; y: number }) => void;
}): NavItem {
  return {
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
        variant="ghost"
        size="sm"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onOpenSelectionMenu({ x: rect.left, y: rect.bottom + 4 });
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
        {selectionCount > 0 ? (
          <span className="text-sm font-semibold text-orange-500 tabular-nums">{selectionCount}</span>
        ) : null}
      </Button>
    ),
  };
}

function buildToolbarItems({
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
}: {
  playlistId: string | null;
  canEditPlaylistInfo: boolean;
  setEditDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isReloading: boolean;
  onReload: () => void;
  hasTracks: boolean;
  onPlayFirst?: (() => void) | undefined;
  isEditable: boolean;
  locked: boolean;
  panelCount: number;
  dndMode: 'move' | 'copy';
  onDndModeToggle: () => void;
  hasDuplicates: boolean;
  onDeleteDuplicates?: (() => void) | undefined;
  isDeletingDuplicates: boolean;
  isSorted: boolean;
  onSaveCurrentOrder?: (() => void) | undefined;
  isSavingOrder: boolean;
  insertionMarkerCount: number;
  onClearInsertionMarkers?: (() => void) | undefined;
  autoScrollEnabled: boolean;
  toggleAutoScroll: () => void;
  onLockToggle: () => void;
  showSplitCommands: boolean;
  canSplitHorizontal: boolean;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  isPhone: boolean;
  isLastPanel: boolean;
  onClose: () => void;
  disableClose: boolean;
}): NavItem[] {
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
  return items;
}

function useToolbarLayoutState(toolbarRef: React.RefObject<HTMLDivElement | null>) {
  const [isUltraCompact, setIsUltraCompact] = useState(false);
  const [canSplitHorizontal, setCanSplitHorizontal] = useState(true);

  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        setIsUltraCompact(width < ULTRA_COMPACT_BREAKPOINT);
        setCanSplitHorizontal(width >= MIN_SPLIT_WIDTH);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [toolbarRef]);

  return {
    isUltraCompact,
    canSplitHorizontal,
  };
}

function useToolbarSearch(onSearchChange: PanelToolbarProps['onSearchChange'], searchQuery: string) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);
    onSearchChange(value);
  }, [onSearchChange]);

  return {
    localSearch,
    handleSearchChange,
  };
}

function usePlaylistEditState({
  playlistId,
  playlistName,
  playlistDescription,
  playlistIsPublic,
  isEditable,
}: {
  playlistId: string | null;
  playlistName: string | undefined;
  playlistDescription: string | undefined;
  playlistIsPublic: boolean | undefined;
  isEditable: boolean;
}) {
  const [displayPlaylistName, setDisplayPlaylistName] = useState(playlistName ?? '');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const updatePlaylist = useUpdatePlaylist();
  const isLiked = playlistId !== null && isLikedSongsPlaylist(playlistId);
  const canEditPlaylistInfo = Boolean(playlistId && isEditable && !isLiked);

  useEffect(() => {
    setDisplayPlaylistName(playlistName ?? '');
  }, [playlistName]);

  const handleUpdatePlaylist = useCallback(async (values: { name: string; description: string; isPublic: boolean }) => {
    if (!playlistId) {
      return;
    }

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

  const editDialog = canEditPlaylistInfo ? (
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
  ) : null;

  return {
    displayPlaylistName,
    setEditDialogOpen,
    editDialog,
    canEditPlaylistInfo,
  };
}

function ToolbarSearchInput({
  localSearch,
  handleSearchChange,
  isPhone,
  compact,
}: {
  localSearch: string;
  handleSearchChange: (value: string) => void;
  isPhone: boolean;
  compact: boolean;
}) {
  return (
    <div className={compact ? 'relative' : 'relative flex-1 min-w-0 basis-0'}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        placeholder="Search..."
        value={localSearch}
        onChange={(e: ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value)}
        className={compact ? 'pl-9 h-8 text-sm' : cn('pl-9 h-9 text-sm', isPhone && 'h-8')}
      />
    </div>
  );
}

function useUltraCompactHeader({
  isUltraCompact,
  playlistId,
  localSearch,
  handleSearchChange,
  isPhone,
}: {
  isUltraCompact: boolean;
  playlistId: string | null;
  localSearch: string;
  handleSearchChange: (value: string) => void;
  isPhone: boolean;
}) {
  return useMemo(() => {
    if (!isUltraCompact || !playlistId) {
      return undefined;
    }

    return (
      <div className="px-2 py-1.5">
        <ToolbarSearchInput
          localSearch={localSearch}
          handleSearchChange={handleSearchChange}
          isPhone={isPhone}
          compact={true}
        />
      </div>
    );
  }, [isUltraCompact, playlistId, localSearch, handleSearchChange, isPhone]);
}

function useToolbarNavItems({
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
}: {
  playlistId: string | null;
  canEditPlaylistInfo: boolean;
  setEditDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isReloading: boolean;
  onReload: () => void;
  hasTracks: boolean;
  onPlayFirst?: (() => void) | undefined;
  isEditable: boolean;
  locked: boolean;
  panelCount: number;
  dndMode: 'move' | 'copy';
  onDndModeToggle: () => void;
  hasDuplicates: boolean;
  onDeleteDuplicates?: (() => void) | undefined;
  isDeletingDuplicates: boolean;
  isSorted: boolean;
  onSaveCurrentOrder?: (() => void) | undefined;
  isSavingOrder: boolean;
  insertionMarkerCount: number;
  onClearInsertionMarkers?: (() => void) | undefined;
  autoScrollEnabled: boolean;
  toggleAutoScroll: () => void;
  onLockToggle: () => void;
  showSplitCommands: boolean;
  canSplitHorizontal: boolean;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  isPhone: boolean;
  isLastPanel: boolean;
  onClose: () => void;
  disableClose: boolean;
  onOpenSelectionMenu?: ((position: { x: number; y: number }) => void) | undefined;
  selectionCount: number;
}) {
  return useMemo(() => {
    const items = buildToolbarItems({
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

    if (!playlistId || !onOpenSelectionMenu) {
      return items;
    }

    return [
      createSelectionNavItem({
        selectionCount,
        onOpenSelectionMenu,
      }),
      ...items,
    ];
  }, [
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
  ]);
}

function PanelToolbarContent({
  toolbarRef,
  isPlayingPanel,
  playlistId,
  displayPlaylistName,
  onLoadPlaylist,
  showSearch,
  localSearch,
  handleSearchChange,
  isPhone,
  navItems,
  ultraCompactHeader,
  editDialog,
}: {
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  isPlayingPanel: boolean;
  playlistId: string | null;
  displayPlaylistName: string;
  onLoadPlaylist: (playlistId: string) => void;
  showSearch: boolean;
  localSearch: string;
  handleSearchChange: (value: string) => void;
  isPhone: boolean;
  navItems: NavItem[];
  ultraCompactHeader: React.ReactNode;
  editDialog: React.ReactNode;
}) {
  return (
    <div
      ref={toolbarRef}
      className="flex items-center gap-1 border-b border-border bg-card relative z-30"
    >
      <div className="flex flex-1 min-w-0 basis-0 items-center gap-1">
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

        {showSearch && (
          <ToolbarSearchInput
            localSearch={localSearch}
            handleSearchChange={handleSearchChange}
            isPhone={isPhone}
            compact={false}
          />
        )}
      </div>

      <div className="flex flex-1 min-w-0 basis-0 justify-end">
        <AdaptiveNav
          items={navItems}
          displayMode="icon-only"
          layoutMode="horizontal"
          dropdownHeader={ultraCompactHeader}
          className="w-full"
        />
      </div>

      {editDialog}
    </div>
  );
}

type ResolvedPanelToolbarProps = Omit<PanelToolbarProps,
  | 'isReloading'
  | 'sortKey'
  | 'sortDirection'
  | 'insertionMarkerCount'
  | 'isSorted'
  | 'isSavingOrder'
  | 'selectionCount'
  | 'panelCount'
  | 'hasTracks'
  | 'hasDuplicates'
  | 'isDeletingDuplicates'
  | 'isPlayingPanel'
> & {
  isReloading: boolean;
  sortKey: SortKey;
  sortDirection: SortDirection;
  insertionMarkerCount: number;
  isSorted: boolean;
  isSavingOrder: boolean;
  selectionCount: number;
  panelCount: number;
  hasTracks: boolean;
  hasDuplicates: boolean;
  isDeletingDuplicates: boolean;
  isPlayingPanel: boolean;
};

const DEFAULT_PANEL_TOOLBAR_PROPS: Pick<ResolvedPanelToolbarProps,
  | 'isReloading'
  | 'sortKey'
  | 'sortDirection'
  | 'insertionMarkerCount'
  | 'isSorted'
  | 'isSavingOrder'
  | 'selectionCount'
  | 'panelCount'
  | 'hasTracks'
  | 'hasDuplicates'
  | 'isDeletingDuplicates'
  | 'isPlayingPanel'
> = {
  isReloading: false,
  sortKey: 'position',
  sortDirection: 'asc',
  insertionMarkerCount: 0,
  isSorted: false,
  isSavingOrder: false,
  selectionCount: 0,
  panelCount: 1,
  hasTracks: false,
  hasDuplicates: false,
  isDeletingDuplicates: false,
  isPlayingPanel: false,
};

function resolvePanelToolbarProps(props: PanelToolbarProps): ResolvedPanelToolbarProps {
  return {
    ...DEFAULT_PANEL_TOOLBAR_PROPS,
    ...props,
  } as ResolvedPanelToolbarProps;
}

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
