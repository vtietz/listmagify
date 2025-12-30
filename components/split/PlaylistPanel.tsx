/**
 * PlaylistPanel component with virtualized track list, search, and DnD support.
 * Each panel can load a playlist independently and sync with other panels showing the same playlist.
 */

'use client';

import { useEffect, useRef, useState, useMemo, useCallback, useDeferredValue } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { AlertCircle, LogIn } from 'lucide-react';
import { apiFetch, ApiError, AccessTokenExpiredError } from '@/lib/api/client';
import { playlistMeta, playlistPermissions } from '@/lib/api/queryKeys';
import { makeCompositeId, getTrackPosition } from '@/lib/dnd/id';
import { DropIndicator } from './DropIndicator';
import { eventBus } from '@/lib/sync/eventBus';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { usePlaylistSort, type SortKey, type SortDirection } from '@/hooks/usePlaylistSort';
import { useTrackListSelection } from '@/hooks/useTrackListSelection';
import { usePlaylistTracksInfinite } from '@/hooks/usePlaylistTracksInfinite';
import { useSavedTracksIndex, usePrefetchSavedTracks } from '@/hooks/useSavedTracksIndex';
import { useLikedVirtualPlaylist, isLikedSongsPlaylist, LIKED_SONGS_METADATA } from '@/hooks/useLikedVirtualPlaylist';
import { useCapturePlaylist } from '@/hooks/useRecommendations';
import { useRemoveTracks } from '@/lib/spotify/playlistMutations';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { getTrackSelectionKey } from '@/lib/dnd/selection';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { SignInButton } from '@/components/auth/SignInButton';
import { PanelToolbar } from './PanelToolbar';
import { TableHeader } from './TableHeader';
import { TrackRow } from './TrackRow';
import { InsertionMarkersOverlay } from './InsertionMarker';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT, VIRTUALIZATION_OVERSCAN } from './constants';
import type { Track } from '@/lib/spotify/types';
import { Skeleton } from '@/components/ui/skeleton';

interface PlaylistPanelProps {
  panelId: string;
  onRegisterVirtualizer:
    | ((
        panelId: string,
        virtualizer: any,
        scrollRef: { current: HTMLDivElement | null },
        filteredTracks: Track[],
        canDrop: boolean
      ) => void)
    | undefined;
  onUnregisterVirtualizer: ((panelId: string) => void) | undefined;
  isActiveDropTarget?: boolean | undefined; // True when mouse is hovering over this panel during drag
  isDragSource?: boolean | undefined; // True when this panel is the source of an active drag
  dropIndicatorIndex?: number | null | undefined; // Filtered index where drop indicator line should appear
  ephemeralInsertion?:
    | {
        activeId: string; // Composite ID of dragged item
        sourcePanelId: string; // Panel where drag originated
        targetPanelId: string; // Panel being hovered over
        insertionIndex: number; // Filtered index where item should be inserted
      }
    | null
    | undefined; // For multi-container "make room" animation
}

export function PlaylistPanel({ panelId, onRegisterVirtualizer, onUnregisterVirtualizer, isActiveDropTarget, isDragSource, dropIndicatorIndex, ephemeralInsertion }: PlaylistPanelProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Track if mouse is over this panel for Ctrl+hover mode preview
  const [isMouseOver, setIsMouseOver] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  
  // Global Ctrl key tracking for mode preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setIsCtrlPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setIsCtrlPressed(false);
      }
    };
    // Also reset on window blur (e.g., user switches tabs while holding Ctrl)
    const handleBlur = () => {
      setIsCtrlPressed(false);
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
  
  const panel = useSplitGridStore((state: any) =>
    state.panels.find((p: any) => p.id === panelId)
  );
  
  const setSearch = useSplitGridStore((state: any) => state.setSearch);
  const setSelection = useSplitGridStore((state: any) => state.setSelection);
  const toggleSelection = useSplitGridStore((state: any) => state.toggleSelection);
  const setScroll = useSplitGridStore((state: any) => state.setScroll);
  const closePanel = useSplitGridStore((state: any) => state.closePanel);
  const splitPanel = useSplitGridStore((state: any) => state.splitPanel);
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

  // User-toggled lock state (only for owned playlists)
  const locked = panel?.locked || false;
  
  // Early canDrop calculation for droppable hook (will be refined after permissions load)
  // Can only drop when sorted by position ascending and not user-locked
  // Note: isEditable check happens in drop handler since permissions may not be loaded yet
  const canDropBasic = !locked && sortKey === 'position' && sortDirection === 'asc';

  // Panel-level droppable for hover detection (gaps, padding, background)
  // Attached to scroll container (not outer wrapper) for precise collision bounds
  // Disable drops when sorted (to prevent reordering in non-position sort)
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `panel-${panelId}`,
    disabled: !canDropBasic,
    data: {
      type: 'panel',
      panelId,
      playlistId,
    },
  });

  // Combined ref callback to attach both scrollRef and droppableRef to scroll container
  // This ensures panel droppable bounds match the actual track list viewport
  const scrollDroppableRef = useCallback(
    (el: HTMLDivElement | null) => {
      // Update our local scrollRef
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      // Register with dnd-kit droppable
      setDroppableRef(el);
    },
    [setDroppableRef]
  );

  // Get insertion markers for this playlist
  // Use getMarkers directly which returns a stable empty array when no markers exist
  const insertionMarkers = useInsertionPointsStore((s) => s.getMarkers(playlistId ?? ''));
  const clearInsertionMarkers = useInsertionPointsStore((s) => s.clearPlaylist);
  const activeMarkerIndices = useMemo(() => 
    new Set(insertionMarkers.map(m => m.index)),
    [insertionMarkers]
  );

  // Check if this is the virtual "Liked Songs" playlist
  const isLikedPlaylist = isLikedSongsPlaylist(playlistId);

  // Use liked virtual playlist for "Liked Songs", regular playlist for others
  const likedPlaylistData = useLikedVirtualPlaylist();
  const regularPlaylistData = usePlaylistTracksInfinite({
    playlistId: isLikedPlaylist ? null : playlistId,
    enabled: !!playlistId && !isLikedPlaylist,
  });

  // Select the appropriate data source
  const {
    allTracks: tracks,
    snapshotId,
    isLoading,
    isFetchingNextPage: isAutoLoading,
    isRefetching,
    hasLoadedAll,
    error,
    dataUpdatedAt,
  } = isLikedPlaylist
    ? {
        allTracks: likedPlaylistData.allTracks,
        snapshotId: 'liked-songs', // Virtual playlist has no snapshot
        isLoading: likedPlaylistData.isLoading,
        isFetchingNextPage: likedPlaylistData.isFetchingNextPage,
        isRefetching: false,
        hasLoadedAll: likedPlaylistData.hasLoadedAll,
        error: likedPlaylistData.error,
        dataUpdatedAt: likedPlaylistData.dataUpdatedAt,
      }
    : {
        allTracks: regularPlaylistData.allTracks,
        snapshotId: regularPlaylistData.snapshotId,
        isLoading: regularPlaylistData.isLoading,
        isFetchingNextPage: regularPlaylistData.isFetchingNextPage,
        isRefetching: regularPlaylistData.isRefetching,
        hasLoadedAll: regularPlaylistData.hasLoadedAll,
        error: regularPlaylistData.error,
        dataUpdatedAt: regularPlaylistData.dataUpdatedAt,
      };

  // Start background prefetch of all saved tracks (once per session)
  usePrefetchSavedTracks();

  // Global saved tracks index for heart icons
  const { isLiked, toggleLiked, ensureCoverage } = useSavedTracksIndex();

  // Capture playlist for recommendations (when fully loaded)
  const capturePlaylist = useCapturePlaylist();
  const capturedRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Build a unique key for deduplication (snapshotId may be null initially)
    const captureKey = snapshotId ? `${playlistId}:${snapshotId}` : playlistId;
    
    // Capture playlist tracks for recommendation system when fully loaded
    // Skip liked songs (virtual playlist) and only capture once per playlist+snapshot combo
    if (
      playlistId && 
      !isLikedPlaylist && 
      hasLoadedAll && 
      tracks.length > 0 &&
      capturedRef.current !== captureKey
    ) {
      console.debug('[recs] Capturing playlist:', playlistId, 'tracks:', tracks.length);
      capturedRef.current = captureKey;
      // Fire and forget - don't block UI
      capturePlaylist.mutate(
        { playlistId, tracks },
        {
          onSuccess: () => {
            console.debug('[recs] Capture succeeded:', playlistId);
          },
          onError: (err: Error) => {
            // Silent fail - recommendations are optional
            console.debug('[recs] Capture failed:', err);
          },
        }
      );
    }
  }, [playlistId, isLikedPlaylist, hasLoadedAll, tracks, snapshotId, capturePlaylist]);

  // Ensure coverage for visible tracks (debounced, for unknown IDs only)
  useEffect(() => {
    if (tracks.length > 0 && hasLoadedAll) {
      const trackIds = tracks
        .map(t => t.id)
        .filter((id): id is string => id !== null);
      ensureCoverage(trackIds);
    }
  }, [tracks, hasLoadedAll, ensureCoverage]);

  // Callback for heart button clicks
  const handleToggleLiked = useCallback((trackId: string, currentlyLiked: boolean) => {
    toggleLiked(trackId, currentlyLiked);
  }, [toggleLiked]);

  // Remove tracks mutation for delete functionality
  const removeTracks = useRemoveTracks();

  // Show reload animation when auto-loading or manually refetching
  const isReloading = isAutoLoading || isRefetching;

  // Fetch playlist metadata for name (skip for virtual liked playlist)
  const { data: playlistMetaData } = useQuery({
    queryKey: playlistId && !isLikedPlaylist ? playlistMeta(playlistId) : ['playlist', null],
    queryFn: async () => {
      if (!playlistId || isLikedPlaylist) throw new Error('No playlist ID');
      const result = await apiFetch<{
        id: string;
        name: string;
        owner: { id: string; displayName: string };
        collaborative: boolean;
        tracksTotal: number;
      }>(`/api/playlists/${playlistId}`);
      return result;
    },
    enabled: !!playlistId && !isLikedPlaylist,
    staleTime: 60000, // 1 minute
  });

  useEffect(() => {
    if (isLikedPlaylist) {
      setPlaylistName(LIKED_SONGS_METADATA.name);
    } else if (playlistMetaData?.name) {
      setPlaylistName(playlistMetaData.name);
    }
  }, [playlistMetaData, isLikedPlaylist]);

  // Fetch playlist permissions (virtual liked playlist is always editable for unlike)
  const { data: permissionsData } = useQuery({
    queryKey: playlistId && !isLikedPlaylist ? playlistPermissions(playlistId) : ['playlist-permissions', null],
    queryFn: async () => {
      if (!playlistId || isLikedPlaylist) throw new Error('No playlist ID');
      const result = await apiFetch<{ isEditable: boolean }>(
        `/api/playlists/${playlistId}/permissions`
      );
      return result;
    },
    enabled: !!playlistId && !isLikedPlaylist,
    staleTime: 60000, // 1 minute
  });

  // Derive isEditable from query result
  // Liked Songs playlist is not editable (can't reorder/add), but can unlike tracks
  const isEditable = isLikedPlaylist ? false : (permissionsData?.isEditable || false);

  // ═══════════════════════════════════════════════════════════════════════════
  // DnD Permissions Model (simplified):
  // ═══════════════════════════════════════════════════════════════════════════
  // 
  // | Playlist Type              | Can Drag FROM | Can Drop INTO | Lock Toggle |
  // |----------------------------|---------------|---------------|-------------|
  // | Liked Songs                | ✅ (copy)     | ❌            | Hidden      |
  // | Other user's playlist      | ✅ (copy)     | ❌            | Hidden      |
  // | Your playlist (unlocked)   | ✅ (move/copy)| ✅            | Enabled     |
  // | Your playlist (locked)     | ✅ (copy)     | ❌            | Enabled     |
  // 
  // Key insight:
  // - `locked` controls DROP TARGET only (can't receive tracks when locked)
  // - All playlists can be DRAG SOURCES (non-editable forced to copy mode)
  // ═══════════════════════════════════════════════════════════════════════════

  // Can always drag FROM any playlist (copy mode for non-editable/locked)
  const canDrag = true;
  
  // Can only drop INTO editable, unlocked, position-sorted playlists
  const canDrop = isEditable && !locked && sortKey === 'position' && sortDirection === 'asc';

  // DnD mode: non-editable or locked playlists force copy mode
  const canMove = isEditable && !locked;
  const storedDndMode = canMove ? (panel?.dndMode || 'copy') : 'copy';
  
  // Preview mode: invert when Ctrl is pressed
  // - During drag (isDragSource is boolean): only the source panel shows inverted mode
  // - When not dragging (isDragSource is undefined): panel under mouse shows inverted mode
  const isDragging = isDragSource !== undefined;
  const showCtrlInvert = isCtrlPressed && canMove && (
    (isDragging && isDragSource) ||  // During drag: only source panel
    (!isDragging && isMouseOver)      // No drag: panel under mouse
  );
  
  const dndMode = showCtrlInvert
    ? (storedDndMode === 'copy' ? 'move' : 'copy')
    : storedDndMode;

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

  // Track URIs for playback context (auto-play next)
  const trackUris = useMemo(() => 
    filteredTracks.map((t: Track) => t.uri),
    [filteredTracks]
  );

  // Playback integration for play buttons
  const playlistUri = playlistId && !isLikedPlaylist 
    ? `spotify:playlist:${playlistId}` 
    : undefined;
  
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris,
    playlistId,
    playlistUri,
  });

  // Get compact mode state for dynamic row height
  const isCompact = useCompactModeStore((state) => state.isCompact);
  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;

  // Defer the count to avoid flushSync during render in React 19
  const deferredCount = useDeferredValue(filteredTracks.length);

  // Virtualization with dynamic row height based on compact mode
  const virtualizer = useVirtualizer({
    count: deferredCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: VIRTUALIZATION_OVERSCAN,
  });

  // Re-measure all items when compact mode changes
  // Use queueMicrotask to defer measure() and avoid flushSync warning in React 19
  useEffect(() => {
    queueMicrotask(() => {
      virtualizer.measure();
    });
  }, [isCompact, virtualizer]);

  const items = virtualizer.getVirtualItems();

  // Compute contextItems with ephemeral insertion for "make room" animation
  const contextItems = useMemo(() => {
    // Use composite IDs scoped by panel for globally unique identification
    const baseItems = filteredTracks.map((t: Track, index: number) => 
      makeCompositeId(panelId, t.id || t.uri, getTrackPosition(t, index))
    );
    
    // For cross-panel drags, we use a visual drop indicator line instead of
    // ephemeral insertion to avoid interfering with @dnd-kit's native animations.
    // The drop indicator is rendered in the JSX below.
    
    return baseItems;
  }, [filteredTracks, panelId]);

  // Register virtualizer with parent for drop position calculation
  useEffect(() => {
    if (onRegisterVirtualizer && playlistId) {
      onRegisterVirtualizer(panelId, virtualizer, scrollRef, filteredTracks, canDrop);
    }
    return () => {
      if (onUnregisterVirtualizer) {
        onUnregisterVirtualizer(panelId);
      }
    };
  }, [panelId, virtualizer, filteredTracks, playlistId, canDrop, onRegisterVirtualizer, onUnregisterVirtualizer]);

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
    splitPanel(panelId, 'horizontal');
  }, [panelId, splitPanel]);

  const handleSplitVertical = useCallback(() => {
    splitPanel(panelId, 'vertical');
  }, [panelId, splitPanel]);

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
      data-testid="playlist-panel"
      data-editable={isEditable}
      className={`flex flex-col h-full border border-border rounded-lg overflow-hidden transition-all ${
        isActiveDropTarget ? 'bg-primary/10' : 'bg-card'
      }`}
      onMouseEnter={() => setIsMouseOver(true)}
      onMouseLeave={() => setIsMouseOver(false)}
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
        insertionMarkerCount={activeMarkerIndices.size}
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
        onClearInsertionMarkers={() => playlistId && clearInsertionMarkers(playlistId)}
      />

      <div
        ref={scrollDroppableRef}
        data-testid="track-list-scroll"
        className="flex-1 overflow-auto focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        style={{ paddingBottom: TRACK_ROW_HEIGHT * 2, overscrollBehaviorX: 'none' }}
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
          <div className="p-4 flex flex-col items-center justify-center text-center gap-3">
            <AlertCircle className="h-8 w-8 text-red-500" />
            {error instanceof AccessTokenExpiredError || 
             (error instanceof ApiError && (error.isUnauthorized || error.isForbidden)) ? (
              <>
                <p className="text-red-500 font-medium">Session expired</p>
                <p className="text-sm text-muted-foreground">
                  Please sign in again to access your playlists.
                </p>
                <SignInButton callbackUrl="/split-editor" className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors" />
              </>
            ) : error instanceof ApiError && error.isNotFound ? (
              <>
                <p className="text-red-500 font-medium">Playlist not found</p>
                <p className="text-sm text-muted-foreground">
                  This playlist may have been deleted or you don&apos;t have access to it.
                </p>
              </>
            ) : (
              <p className="text-red-500">
                Failed to load playlist: {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            )}
          </div>
        )}

        {!isLoading && !error && filteredTracks.length === 0 && (
          <div className="p-4 text-center text-muted-foreground">
            {searchQuery ? 'No tracks match your search' : 'This playlist is empty'}
          </div>
        )}

        {!isLoading && !error && filteredTracks.length > 0 && (
          <>
            {/* Inner content wrapper - fills available width */}
            <div className="relative w-full">
            <TableHeader
              isEditable={isEditable}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
              showLikedColumn={true}
            />
            <SortableContext
              items={contextItems}
              strategy={verticalListSortingStrategy}
            >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
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

              {/* Insertion point markers (orange lines) */}
              {playlistId && isEditable && activeMarkerIndices.size > 0 && (
                <InsertionMarkersOverlay
                  playlistId={playlistId}
                  totalTracks={filteredTracks.length}
                  rowHeight={rowHeight}
                  showToggles={!isDragSource}
                  activeIndices={activeMarkerIndices}
                />
              )}

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
                      isDragSourceSelected={isDragSource && selection.has(selectionId)}
                      showLikedColumn={true}
                      isLiked={track.id ? isLiked(track.id) : false}
                      onToggleLiked={handleToggleLiked}
                      isPlaying={track.id ? isTrackPlaying(track.id) : false}
                      isPlaybackLoading={isTrackLoading(track.uri)}
                      onPlay={playTrack}
                      onPause={pausePlayback}
                      hasInsertionMarker={activeMarkerIndices.has(virtualRow.index)}
                      hasInsertionMarkerAfter={false}
                    />
                  </div>
                );
              })}
            </div>
          </SortableContext>
          </div>
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
