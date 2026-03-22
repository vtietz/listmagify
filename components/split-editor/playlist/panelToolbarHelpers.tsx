'use client';

import { useState, useEffect, ChangeEvent, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ListChecks } from 'lucide-react';
import { PlaylistSelector } from './PlaylistSelector';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlaylistDialog } from '@/components/playlist/PlaylistDialog';
import { AdaptiveNav, type NavItem } from '@/components/ui/adaptive-nav';
import { buildPanelToolbarNavItems } from './panelToolbarNavItems';
import { ProviderStatusDropdown } from '@/components/auth/ProviderStatusDropdown';
import { useAuthSummary } from '@/hooks/auth/useAuth';
import { useUpdatePlaylist } from '@/lib/spotify/playlistMutations';
import { isLikedSongsPlaylist } from '@/hooks/useLikedVirtualPlaylist';
import { cn } from '@/lib/utils';
import type { SortKey, SortDirection } from '@/hooks/usePlaylistSort';
import type { MusicProviderId } from '@/lib/music-provider/types';

const ULTRA_COMPACT_BREAKPOINT = 280;
const MIN_SPLIT_WIDTH = ULTRA_COMPACT_BREAKPOINT;

interface AppConfigResponse {
  availableProviders?: MusicProviderId[];
}

function useAvailableProviders(): MusicProviderId[] {
  const { data } = useQuery({
    queryKey: ['app-config'],
    queryFn: async () => {
      const response = await fetch('/api/config');
      if (!response.ok) {
        return { availableProviders: ['spotify'] } satisfies AppConfigResponse;
      }

      return response.json() as Promise<AppConfigResponse>;
    },
    staleTime: Infinity,
  });

  const providers = data?.availableProviders;
  if (!providers || providers.length === 0) {
    return ['spotify'];
  }

  return providers;
}

export interface PanelToolbarProps {
  panelId: string;
  providerId: MusicProviderId;
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
  isSorted?: boolean;
  isSavingOrder?: boolean;
  selectionCount?: number;
  onOpenSelectionMenu?: (position: { x: number; y: number }) => void;
  onClearSelection?: () => void;
  panelCount?: number;
  hasTracks?: boolean;
  hasDuplicates?: boolean;
  isDeletingDuplicates?: boolean;
  isPlayingPanel?: boolean;
  onSearchChange: (query: string) => void;
  onSortChange?: (key: SortKey, direction: SortDirection) => void;
  onReload: () => void;
  onClose: () => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onDndModeToggle: () => void;
  onLockToggle: () => void;
  onProviderChange: (providerId: MusicProviderId) => void;
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

type ToolbarItemsInput = Parameters<typeof buildPanelToolbarNavItems>[0];

function buildToolbarItems(args: ToolbarItemsInput): NavItem[] {
  return buildPanelToolbarNavItems(args);
}

export function useToolbarLayoutState(toolbarRef: React.RefObject<HTMLDivElement | null>) {
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

  return { isUltraCompact, canSplitHorizontal };
}

export function useToolbarSearch(onSearchChange: PanelToolbarProps['onSearchChange'], searchQuery: string) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);
    onSearchChange(value);
  }, [onSearchChange]);

  return { localSearch, handleSearchChange };
}

export function usePlaylistEditState({
  providerId,
  playlistId,
  playlistName,
  playlistDescription,
  playlistIsPublic,
  isEditable,
}: {
  providerId: MusicProviderId;
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
        providerId,
        playlistId,
        name: values.name,
        description: values.description,
        isPublic: values.isPublic,
      });
    } catch (error) {
      setDisplayPlaylistName(previousName);
      throw error;
    }
  }, [providerId, playlistId, updatePlaylist, displayPlaylistName]);

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

export function useUltraCompactHeader({
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

export function useToolbarNavItems({
  playlistId,
  onOpenSelectionMenu,
  selectionCount,
  ...args
}: ToolbarItemsInput & {
  onOpenSelectionMenu: ((position: { x: number; y: number }) => void) | undefined;
  selectionCount: number;
}) {
  return useMemo(() => {
    const items = buildToolbarItems({ playlistId, ...args });

    if (!playlistId || !onOpenSelectionMenu) {
      return items;
    }

    return [
      createSelectionNavItem({ selectionCount, onOpenSelectionMenu }),
      ...items,
    ];
  }, [playlistId, onOpenSelectionMenu, selectionCount, args]);
}

export function PanelToolbarContent({
  toolbarRef,
  isPlayingPanel,
  providerId,
  playlistId,
  displayPlaylistName,
  onProviderChange,
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
  providerId: MusicProviderId;
  playlistId: string | null;
  displayPlaylistName: string;
  onProviderChange: (providerId: MusicProviderId) => void;
  onLoadPlaylist: (playlistId: string) => void;
  showSearch: boolean;
  localSearch: string;
  handleSearchChange: (value: string) => void;
  isPhone: boolean;
  navItems: NavItem[];
  ultraCompactHeader: React.ReactNode;
  editDialog: React.ReactNode;
}) {
  const availableProviders = useAvailableProviders();
  const authSummary = useAuthSummary();

  const statusMap = useMemo(() => ({
    spotify: authSummary.spotify.code === 'ok' ? 'connected' : 'disconnected',
    tidal: authSummary.tidal.code === 'ok' ? 'connected' : 'disconnected',
  } satisfies Record<MusicProviderId, 'connected' | 'disconnected'>), [authSummary.spotify.code, authSummary.tidal.code]);

  return (
    <div ref={toolbarRef} className="flex items-center gap-1 border-b border-border bg-card relative z-50">
      <div className="flex flex-1 min-w-0 basis-0 items-center gap-1">
        <div className="flex-1 min-w-0 basis-0 flex items-center gap-2">
          <div className="shrink-0">
            <ProviderStatusDropdown
              context="panel"
              currentProviderId={providerId}
              providers={availableProviders}
              statusMap={statusMap}
              playingProviderInPanel={isPlayingPanel ? providerId : null}
              onProviderChange={onProviderChange}
              data-testid="panel-provider-status-dropdown"
            />
          </div>
          <div className="flex-1 min-w-0">
            <PlaylistSelector
              providerId={providerId}
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

export type ResolvedPanelToolbarProps = Omit<PanelToolbarProps,
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

export function resolvePanelToolbarProps(props: PanelToolbarProps): ResolvedPanelToolbarProps {
  return {
    ...DEFAULT_PANEL_TOOLBAR_PROPS,
    ...props,
  } as ResolvedPanelToolbarProps;
}