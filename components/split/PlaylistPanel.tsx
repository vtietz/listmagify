/**
 * PlaylistPanel component with virtualized track list, search, and DnD support.
 * Each panel can load a playlist independently and sync with other panels showing the same playlist.
 */

'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { apiFetch } from '@/lib/api/client';
import { playlistMeta, playlistPermissions } from '@/lib/api/queryKeys';
import { makeCompositeId } from '@/lib/dnd/id';
import { DropIndicator } from './DropIndicator';
import { eventBus } from '@/lib/sync/eventBus';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { usePlaylistSort, type SortKey, type SortDirection } from '@/hooks/usePlaylistSort';
import { useTrackListSelection } from '@/hooks/useTrackListSelection';
import { usePlaylistTracksInfinite } from '@/hooks/usePlaylistTracksInfinite';
import { useRemoveTracks } from '@/lib/spotify/playlistMutations';
import { getTrackSelectionKey } from '@/lib/dnd/selection';
import { PanelToolbar } from './PanelToolbar';
import { TableHeader } from './TableHeader';
import { TrackRow } from './TrackRow';
import { TRACK_ROW_HEIGHT, VIRTUALIZATION_OVERSCAN } from './constants';
import type { Track } from '@/lib/spotify/types';
import { Skeleton } from '@/components/ui/skeleton';

interface PlaylistPanelProps {
  panelId: string;
  onRegisterVirtualizer?: (panelId: string, virtualizer: any, scrollRef: { current: HTMLDivElement | null }, filteredTracks: Track[]) => void;
  onUnregisterVirtualizer?: (panelId: string) => void;
  isActiveDropTarget?: boolean; // True when mouse is hovering over this panel during drag
  dropIndicatorIndex?: number | null; // Filtered index where drop indicator line should appear
  ephemeralInsertion?: {
    activeId: string; // Composite ID of dragged item
    sourcePanelId: string; // Panel where drag originated
    targetPanelId: string; // Panel being hovered over
    insertionIndex: number; // Filtered index where item should be inserted
  } | null; // For multi-container "make room" animation
}

export function PlaylistPanel({ panelId, onRegisterVirtualizer, onUnregisterVirtualizer, isActiveDropTarget, dropIndicatorIndex, ephemeralInsertion }: PlaylistPanelProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const panel = useSplitGridStore((state: any) =>
    state.panels.find((p: any) => p.id === panelId)
  );
  
  const setSearch = useSplitGridStore((state: any) => state.setSearch);
  const setSelection = useSplitGridStore((state: any) => state.setSelection);
  const toggleSelection = useSplitGridStore((state: any) => state.toggleSelection);
  const setScroll = useSplitGridStore((state: any) => state.setScroll);
  const closePanel = useSplitGridStore((state: any) => state.closePanel);
  const clonePanel = useSplitGridStore((state: any) => state.clonePanel);
  const setPanelDnDMode = useSplitGridStore((state: any) => state.setPanelDnDMode);
  const togglePanelLock = useSplitGridStore((state: any) => state.togglePanelLock);
  const loadPlaylist = useSplitGridStore((state: any) => state.loadPlaylist);
  const selectPlaylist = useSplitGridStore((state: any) => state.selectPlaylist);

  const [playlistName, setPlaylistName] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('position');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const playlistId = panel?.playlistId;
  const searchQuery = panel?.searchQuery || '';
  const selection = panel?.selection || new Set();

  // Derive locked and canDrop state early (needed for droppable hook)
  const locked = panel?.locked || false;
  const canDrop = !locked && sortKey === 'position'; // Only accept drops when sorted by position

  // Panel-level droppable for hover detection (gaps, padding, background)
  // Disable drops when sorted (to prevent reordering in non-position sort)
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `panel-${panelId}`,
    disabled: !canDrop,
    data: {
      type: 'panel',
      panelId,
      playlistId,
    },
  });

  // Use infinite query as single source of truth for playlist tracks
  const { 
    allTracks: tracks, 
    snapshotId,
    isLoading, 
    isFetchingNextPage: isAutoLoading,
    isRefetching,
    hasLoadedAll,
    error,
    dataUpdatedAt,
  } = usePlaylistTracksInfinite({
    playlistId,
    enabled: !!playlistId,
  });

  // Remove tracks mutation for delete functionality
  const removeTracks = useRemoveTracks();

  // Show reload animation when auto-loading or manually refetching
  const isReloading = isAutoLoading || isRefetching;

  // Fetch playlist metadata for name
  const { data: playlistMetaData } = useQuery({
    queryKey: playlistId ? playlistMeta(playlistId) : ['playlist', null],
    queryFn: async () => {
      if (!playlistId) throw new Error('No playlist ID');
      const result = await apiFetch<{
        id: string;
        name: string;
        owner: { id: string; displayName: string };
        collaborative: boolean;
        tracksTotal: number;
      }>(`/api/playlists/${playlistId}`);
      return result;
    },
    enabled: !!playlistId,
    staleTime: 60000, // 1 minute
  });

  useEffect(() => {
    if (playlistMetaData?.name) {
      setPlaylistName(playlistMetaData.name);
    }
  }, [playlistMetaData]);

  // Fetch playlist permissions
  const { data: permissionsData } = useQuery({
    queryKey: playlistId ? playlistPermissions(playlistId) : ['playlist-permissions', null],
    queryFn: async () => {
      if (!playlistId) throw new Error('No playlist ID');
      const result = await apiFetch<{ isEditable: boolean }>(
        `/api/playlists/${playlistId}/permissions`
      );
      return result;
    },
    enabled: !!playlistId,
    staleTime: 60000, // 1 minute
  });

  // Derive isEditable from query result
  const isEditable = permissionsData?.isEditable || false;

  // Read-only playlists are always in 'copy' mode
  const dndMode = isEditable ? (panel?.dndMode || 'copy') : 'copy';
  
  // Separate drag source and drop target locking:
  // - Can drag FROM sorted table (if not locked and editable)
  // - Cannot drop INTO sorted table (prevents reordering when sorted)
  const canDrag = !locked && isEditable;

  // Update store when permissions are loaded
  useEffect(() => {
    if (playlistId && permissionsData) {
      loadPlaylist(panelId, playlistId, permissionsData.isEditable);
    }
  }, [playlistId, panelId, permissionsData, loadPlaylist]);

  // Subscribe to playlist update events
  useEffect(() => {
    if (!playlistId) return;

    const unsubscribeUpdate = eventBus.on('playlist:update', ({ playlistId: id }) => {
      if (id === playlistId) {
        // Don't refetch - mutations handle cache updates optimistically
        // Only cross-panel sync needs this, and they should refetch to get full data
        // But for the source panel, the optimistic update is already applied
        const currentPanel = panel;
        if (!currentPanel) return;
        
        // Only refetch if we're a different panel viewing the same playlist
        // (source panel already has optimistic update)
        // For now, skip refetch entirely - optimistic updates are enough
      }
    });

    const unsubscribeReload = eventBus.on('playlist:reload', ({ playlistId: id }) => {
      if (id === playlistId) {
        console.log('🔄 Reloading playlist tracks from server:', playlistId);
        // Save scroll position
        const scrollTop = scrollRef.current?.scrollTop || 0;
        setScroll(panelId, scrollTop);
        
        // Invalidate the infinite query to trigger a fresh fetch
        // Note: With placeholderData, the old data stays visible during refetch
        queryClient.invalidateQueries({ 
          queryKey: ['playlist-tracks-infinite', playlistId],
        }).then(() => {
          console.log('✅ Playlist reload complete:', playlistId);
          // Restore scroll position after refetch
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollTop;
          }
        });
      }
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeReload();
    };
  }, [playlistId, panelId, queryClient, setScroll, panel]);

  // Apply sorting to tracks
  const sortedTracks = usePlaylistSort({
    tracks: tracks || [],
    sortKey,
    sortDirection,
  });

  // Filter sorted tracks based on search
  const filteredTracks = useMemo(() => {
    if (sortedTracks.length === 0) return [];
    if (!searchQuery.trim()) return sortedTracks;

    const query = searchQuery.toLowerCase();
    return sortedTracks.filter(
      (track: Track) =>
        track.name.toLowerCase().includes(query) ||
        track.artists.some((artist: string) => artist.toLowerCase().includes(query)) ||
        track.album?.name?.toLowerCase().includes(query)
    );
  }, [sortedTracks, searchQuery]);

  // Virtualization with constant row height
  const virtualizer = useVirtualizer({
    count: filteredTracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TRACK_ROW_HEIGHT,
    overscan: VIRTUALIZATION_OVERSCAN,
  });

  const items = virtualizer.getVirtualItems();

  // Compute contextItems with ephemeral insertion for "make room" animation
  const contextItems = useMemo(() => {
    // Use composite IDs scoped by panel for globally unique identification
    const baseItems = filteredTracks.map((t: Track) => makeCompositeId(panelId, t.id || t.uri));
    
    // For cross-panel drags, we use a visual drop indicator line instead of
    // ephemeral insertion to avoid interfering with @dnd-kit's native animations.
    // The drop indicator is rendered in the JSX below.
    
    return baseItems;
  }, [filteredTracks, panelId]);

  // Register virtualizer with parent for drop position calculation
  useEffect(() => {
    if (onRegisterVirtualizer && playlistId) {
      onRegisterVirtualizer(panelId, virtualizer, scrollRef, filteredTracks);
    }
    return () => {
      if (onUnregisterVirtualizer) {
        onUnregisterVirtualizer(panelId);
      }
    };
  }, [panelId, virtualizer, filteredTracks, playlistId, onRegisterVirtualizer, onUnregisterVirtualizer]);

  // Handlers
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearch(panelId, query);
    },
    [panelId, setSearch]
  );

  const handleReload = useCallback(() => {
    if (playlistId) {
      console.log('🔄 Reload button clicked for playlist:', playlistId);
      eventBus.emit('playlist:reload', { playlistId });
    }
  }, [playlistId]);

  const handleClose = useCallback(() => {
    closePanel(panelId);
  }, [panelId, closePanel]);

  const handleSplitHorizontal = useCallback(() => {
    clonePanel(panelId, 'horizontal');
  }, [panelId, clonePanel]);

  const handleSplitVertical = useCallback(() => {
    clonePanel(panelId, 'vertical');
  }, [panelId, clonePanel]);

  const handleDndModeToggle = useCallback(() => {
    const newMode = dndMode === 'move' ? 'copy' : 'move';
    setPanelDnDMode(panelId, newMode);
  }, [panelId, dndMode, setPanelDnDMode]);

  const handleLockToggle = useCallback(() => {
    togglePanelLock(panelId);
  }, [panelId, togglePanelLock]);

  const handleDeleteSelected = useCallback(() => {
    if (!playlistId || selection.size === 0) return;

    // Build tracks array with positions for precise removal (handles duplicate tracks)
    // Selection keys are in format "trackId::position"
    const tracksToRemove: Array<{ uri: string; positions: number[] }> = [];
    const uriToPositions = new Map<string, number[]>();

    filteredTracks.forEach((track: Track, index: number) => {
      const key = getTrackSelectionKey(track, index);
      if (selection.has(key)) {
        // Use the track's actual playlist position, not the filtered index
        const position = track.position ?? index;
        const positions = uriToPositions.get(track.uri) || [];
        positions.push(position);
        uriToPositions.set(track.uri, positions);
      }
    });

    // Convert map to array format expected by API
    uriToPositions.forEach((positions, uri) => {
      tracksToRemove.push({ uri, positions });
    });

    if (tracksToRemove.length === 0) return;

    const mutationParams = snapshotId
      ? { playlistId, tracks: tracksToRemove, snapshotId }
      : { playlistId, tracks: tracksToRemove };

    removeTracks.mutate(mutationParams, {
      onSuccess: () => {
        // Clear selection after successful deletion
        setSelection(panelId, []);
      },
    });
  }, [playlistId, selection, filteredTracks, removeTracks, snapshotId, panelId, setSelection]);

  const handleSort = useCallback((key: SortKey) => {
    // Toggle direction if clicking the same column
    if (key === sortKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }, [sortKey, sortDirection]);

  const handleLoadPlaylist = useCallback(
    (newPlaylistId: string) => {
      selectPlaylist(panelId, newPlaylistId);
    },
    [panelId, selectPlaylist]
  );

  const selectionKey = useCallback((track: Track, index: number) => getTrackSelectionKey(track, index), []);

  const { handleTrackClick, handleTrackSelect, handleKeyDownNavigation, focusedIndex } = useTrackListSelection({
    filteredTracks,
    selection,
    panelId,
    setSelection,
    toggleSelection,
    virtualizer,
    selectionKey,
  });

  // Save scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      setScroll(panelId, el.scrollTop);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [panelId, setScroll]);

  // Restore scroll position on data change
  useEffect(() => {
    if (scrollRef.current && panel?.scrollOffset) {
      scrollRef.current.scrollTop = panel.scrollOffset;
    }
  }, [dataUpdatedAt, panel?.scrollOffset]);

  if (!playlistId) {
    return (
      <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden bg-card">
        <PanelToolbar
          panelId={panelId}
          playlistId={null}
          isEditable={false}
          dndMode="copy"
          locked={false}
          searchQuery=""
          isReloading={false}
          onSearchChange={() => {}}
          onReload={() => {}}
          onClose={handleClose}
          onSplitHorizontal={handleSplitHorizontal}
          onSplitVertical={handleSplitVertical}
          onDndModeToggle={() => {}}
          onLockToggle={() => {}}
          onLoadPlaylist={handleLoadPlaylist}
        />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>Select a playlist to load</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={setDroppableRef}
      data-testid="playlist-panel"
      data-editable={isEditable}
      className={`flex flex-col h-full border rounded-lg overflow-hidden bg-card transition-all ${
        isActiveDropTarget ? 'border-primary border-2 shadow-lg' : 'border-border'
      }`}
    >
      <PanelToolbar
        panelId={panelId}
        playlistId={playlistId}
        playlistName={playlistName}
        isEditable={isEditable}
        dndMode={dndMode}
        locked={locked}
        searchQuery={searchQuery}
        isReloading={isReloading}
        sortKey={sortKey}
        sortDirection={sortDirection}
        selectedCount={selection.size}
        isDeleting={removeTracks.isPending}
        onSearchChange={handleSearchChange}
        onSortChange={(key, direction) => {
          setSortKey(key);
          setSortDirection(direction);
        }}
        onReload={handleReload}
        onClose={handleClose}
        onSplitHorizontal={handleSplitHorizontal}
        onSplitVertical={handleSplitVertical}
        onDndModeToggle={handleDndModeToggle}
        onLockToggle={handleLockToggle}
        onLoadPlaylist={handleLoadPlaylist}
        onDeleteSelected={handleDeleteSelected}
      />

      <div
        ref={scrollRef}
        data-testid="track-list-scroll"
        className="flex-1 overflow-auto focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        style={{ paddingBottom: TRACK_ROW_HEIGHT * 2 }}
        role="listbox"
        aria-multiselectable="true"
        aria-activedescendant={focusedIndex !== null ? `option-${panelId}-${focusedIndex}` : undefined}
        tabIndex={0}
        onKeyDown={handleKeyDownNavigation}
      >
        {isLoading && (
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-red-500">
            Failed to load playlist: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        )}

        {!isLoading && !error && filteredTracks.length === 0 && (
          <div className="p-4 text-center text-muted-foreground">
            {searchQuery ? 'No tracks match your search' : 'This playlist is empty'}
          </div>
        )}

        {!isLoading && !error && filteredTracks.length > 0 && (
          <>
            <TableHeader
              isEditable={isEditable}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <SortableContext
              items={contextItems}
              strategy={verticalListSortingStrategy}
            >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {/* Visual drop indicator line */}
              <DropIndicator
                panelId={panelId}
                dropIndicatorIndex={dropIndicatorIndex}
                virtualItems={items}
                filteredTracksCount={filteredTracks.length}
              />

              {items.map((virtualRow) => {
                const track = filteredTracks[virtualRow.index];
                if (!track) return null;
                
                const selectionId = selectionKey(track, virtualRow.index);
                const trackId = track.id || track.uri;

                return (
                  <div
                    key={`${panelId}-${trackId}-${virtualRow.index}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <TrackRow
                      track={track}
                      index={virtualRow.index}
                      selectionKey={selectionId}
                      isSelected={selection.has(selectionId)}
                      isEditable={isEditable}
                      locked={!canDrag}
                      onSelect={handleTrackSelect}
                      onClick={handleTrackClick}
                      panelId={panelId}
                      playlistId={playlistId}
                      dndMode={dndMode}
                    />
                  </div>
                );
              })}
            </div>
          </SortableContext>
          </>
        )}

        {isAutoLoading && (
          <div className="p-3 text-center text-xs text-muted-foreground">
            Loading all tracks for this playlist… ({tracks.length} loaded)
          </div>
        )}
      </div>
    </div>
  );
}
