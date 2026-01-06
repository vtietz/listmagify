/**
 * Custom hook that encapsulates all state and logic for PlaylistPanel.
 * Extracts ~400 lines of hooks/effects/callbacks from the component.
 */

import { useEffect, useRef, useState, useMemo, useCallback, useDeferredValue } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDroppable } from '@dnd-kit/core';
import { apiFetch } from '@/lib/api/client';
import { playlistMeta, playlistPermissions } from '@/lib/api/queryKeys';
import { makeCompositeId, getTrackPosition } from '@/lib/dnd/id';
import { matchesAllWords } from '@/lib/utils';
import { eventBus } from '@/lib/sync/eventBus';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { usePlaylistSort, type SortKey, type SortDirection } from '@/hooks/usePlaylistSort';
import { useTrackListSelection } from '@/hooks/useTrackListSelection';
import { usePlaylistTracksInfinite } from '@/hooks/usePlaylistTracksInfinite';
import { useSavedTracksIndex, usePrefetchSavedTracks } from '@/hooks/useSavedTracksIndex';
import { useLikedVirtualPlaylist, isLikedSongsPlaylist, LIKED_SONGS_METADATA } from '@/hooks/useLikedVirtualPlaylist';
import { useCapturePlaylist } from '@/hooks/useRecommendations';
import { useRemoveTracks, useAddTracks, useReorderAllTracks } from '@/lib/spotify/playlistMutations';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { getTrackSelectionKey } from '@/lib/dnd/selection';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { usePrefetchContributorProfiles, useUserProfilesCache } from '@/hooks/useUserProfiles';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT, VIRTUALIZATION_OVERSCAN } from '@/components/split/constants';
import type { Track } from '@/lib/spotify/types';

interface UsePlaylistPanelStateProps {
  panelId: string;
  isDragSource?: boolean | undefined;
}

export function usePlaylistPanelState({ panelId, isDragSource }: UsePlaylistPanelStateProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Track scroll element for virtualizer (use state to avoid flushSync during render)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  
  // Track if mouse is over this panel for Ctrl+hover mode preview
  const [isMouseOver, setIsMouseOver] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  
  // Global Ctrl key tracking for mode preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(false);
    };
    const handleBlur = () => setIsCtrlPressed(false);
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Store selectors
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

  // Local state
  const [playlistName, setPlaylistName] = useState<string>('');
  const [playlistDescription, setPlaylistDescription] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('position');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const playlistId = panel?.playlistId;
  const searchQuery = panel?.searchQuery || '';
  const selection = panel?.selection || new Set();
  const locked = panel?.locked || false;

  // Early canDrop calculation for droppable hook
  const canDropBasic = !locked && sortKey === 'position' && sortDirection === 'asc';

  // Panel-level droppable
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `panel-${panelId}`,
    disabled: !canDropBasic,
    data: { type: 'panel', panelId, playlistId },
  });

  // Combined ref callback
  const scrollDroppableRef = useCallback(
    (el: HTMLDivElement | null) => {
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      setDroppableRef(el);
      setScrollElement(el);
    },
    [setDroppableRef, setScrollElement]
  );

  // Insertion markers
  const insertionMarkers = useInsertionPointsStore((s) => s.getMarkers(playlistId ?? ''));
  const clearInsertionMarkers = useInsertionPointsStore((s) => s.clearPlaylist);
  const activeMarkerIndices = useMemo(() => 
    new Set(insertionMarkers.map(m => m.index)),
    [insertionMarkers]
  );

  // Playlist data source selection
  const isLikedPlaylist = isLikedSongsPlaylist(playlistId);
  const likedPlaylistData = useLikedVirtualPlaylist();
  const regularPlaylistData = usePlaylistTracksInfinite({
    playlistId: isLikedPlaylist ? null : playlistId,
    enabled: !!playlistId && !isLikedPlaylist,
  });

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
        snapshotId: 'liked-songs',
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

  // Saved tracks index
  usePrefetchSavedTracks();
  const { isLiked, toggleLiked, ensureCoverage } = useSavedTracksIndex();

  // Capture playlist for recommendations
  const capturePlaylist = useCapturePlaylist();
  const capturedRef = useRef<string | null>(null);
  
  useEffect(() => {
    const captureKey = snapshotId ? `${playlistId}:${snapshotId}` : playlistId;
    if (playlistId && hasLoadedAll && tracks.length > 0 && capturedRef.current !== captureKey) {
      capturedRef.current = captureKey;
      capturePlaylist.mutate(
        { playlistId, tracks, cooccurrenceOnly: isLikedPlaylist },
        { onError: () => {} }
      );
    }
  }, [playlistId, isLikedPlaylist, hasLoadedAll, tracks, snapshotId, capturePlaylist]);

  useEffect(() => {
    if (tracks.length > 0 && hasLoadedAll) {
      const trackIds = tracks.map(t => t.id).filter((id): id is string => id !== null);
      ensureCoverage(trackIds);
    }
  }, [tracks, hasLoadedAll, ensureCoverage]);

  const handleToggleLiked = useCallback((trackId: string, currentlyLiked: boolean) => {
    toggleLiked(trackId, currentlyLiked);
  }, [toggleLiked]);

  // Mutations
  const removeTracks = useRemoveTracks();
  const addTracks = useAddTracks();
  const reorderAllTracks = useReorderAllTracks();

  // Last.fm config - use dedicated status endpoint (no API calls to Last.fm)
  const { data: lastfmConfig } = useQuery({
    queryKey: ['lastfm-status'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/lastfm/status');
        if (!response.ok) return { enabled: false };
        const data = await response.json();
        return { enabled: data.enabled === true };
      } catch {
        return { enabled: false };
      }
    },
    staleTime: Infinity,
    retry: false,
  });
  const lastfmEnabled = lastfmConfig?.enabled ?? false;

  const isReloading = isAutoLoading || isRefetching;

  // Playlist metadata
  const { data: playlistMetaData } = useQuery({
    queryKey: playlistId && !isLikedPlaylist ? playlistMeta(playlistId) : ['playlist', null],
    queryFn: async () => {
      if (!playlistId || isLikedPlaylist) throw new Error('No playlist ID');
      return apiFetch<{
        id: string;
        name: string;
        description: string;
        owner: { id: string; displayName: string };
        collaborative: boolean;
        tracksTotal: number;
      }>(`/api/playlists/${playlistId}`);
    },
    enabled: !!playlistId && !isLikedPlaylist,
    staleTime: 60000,
  });

  useEffect(() => {
    if (isLikedPlaylist) {
      setPlaylistName(LIKED_SONGS_METADATA.name);
      setPlaylistDescription(LIKED_SONGS_METADATA.description ?? '');
    } else if (playlistMetaData?.name) {
      setPlaylistName(playlistMetaData.name);
      setPlaylistDescription(playlistMetaData.description ?? '');
    }
  }, [playlistMetaData, isLikedPlaylist]);

  // Permissions
  const { data: permissionsData } = useQuery({
    queryKey: playlistId && !isLikedPlaylist ? playlistPermissions(playlistId) : ['playlist-permissions', null],
    queryFn: async () => {
      if (!playlistId || isLikedPlaylist) throw new Error('No playlist ID');
      return apiFetch<{ isEditable: boolean }>(`/api/playlists/${playlistId}/permissions`);
    },
    enabled: !!playlistId && !isLikedPlaylist,
    staleTime: 60000,
  });

  const isEditable = isLikedPlaylist ? false : (permissionsData?.isEditable || false);
  const canDrag = true;
  const canDrop = isEditable && !locked && sortKey === 'position' && sortDirection === 'asc';
  const canMove = isEditable && !locked;
  const storedDndMode = canMove ? (panel?.dndMode || 'copy') : 'copy';

  const isDragging = isDragSource !== undefined;
  const showCtrlInvert = isCtrlPressed && canMove && (
    (isDragging && isDragSource) || (!isDragging && isMouseOver)
  );
  const dndMode = showCtrlInvert
    ? (storedDndMode === 'copy' ? 'move' : 'copy')
    : storedDndMode;

  useEffect(() => {
    if (playlistId && permissionsData) {
      loadPlaylist(panelId, playlistId, permissionsData.isEditable);
    }
  }, [playlistId, panelId, permissionsData, loadPlaylist]);

  // Event subscriptions
  useEffect(() => {
    if (!playlistId) return;

    const unsubscribeUpdate = eventBus.on('playlist:update', () => {});
    const unsubscribeReload = eventBus.on('playlist:reload', ({ playlistId: id }) => {
      if (id === playlistId) {
        const scrollTop = scrollRef.current?.scrollTop || 0;
        setScroll(panelId, scrollTop);
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['playlist-tracks-infinite', playlistId] }),
          queryClient.invalidateQueries({ queryKey: playlistMeta(playlistId) }),
        ]).then(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollTop;
        });
      }
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeReload();
    };
  }, [playlistId, panelId, queryClient, setScroll]);

  // Sorting and filtering
  const sortedTracks = usePlaylistSort({ tracks: tracks || [], sortKey, sortDirection });
  
  // Track if the playlist is sorted in a non-default order (can save current order)
  const isSorted = sortKey !== 'position' || sortDirection !== 'asc';

  const filteredTracks = useMemo(() => {
    if (sortedTracks.length === 0) return [];
    const query = searchQuery.trim();
    if (!query) return sortedTracks;
    return sortedTracks.filter(
      (track: Track) =>
        matchesAllWords(track.name, query) ||
        track.artists.some((artist: string) => matchesAllWords(artist, query)) ||
        (track.album?.name ? matchesAllWords(track.album.name, query) : false)
    );
  }, [sortedTracks, searchQuery]);

  // Detect duplicate URIs in the track list (same song appearing multiple times)
  const duplicateUris = useMemo(() => {
    const uriCounts = new Map<string, number>();
    for (const track of filteredTracks) {
      const count = uriCounts.get(track.uri) || 0;
      uriCounts.set(track.uri, count + 1);
    }
    // Return set of URIs that appear more than once
    const duplicates = new Set<string>();
    for (const [uri, count] of uriCounts) {
      if (count > 1) {
        duplicates.add(uri);
      }
    }
    return duplicates;
  }, [filteredTracks]);

  // Compute which duplicate URIs are currently selected (for highlighting other instances)
  const selectedDuplicateUris = useMemo(() => {
    const uris = new Set<string>();
    // Build a map from selection key to track for quick lookup
    const keyToTrack = new Map<string, Track>();
    filteredTracks.forEach((track, index) => {
      const key = getTrackSelectionKey(track, index);
      keyToTrack.set(key, track);
    });
    
    selection.forEach((key: string) => {
      const track = keyToTrack.get(key);
      if (track && duplicateUris.has(track.uri)) {
        uris.add(track.uri);
      }
    });
    return uris;
  }, [selection, duplicateUris, filteredTracks]);

  // Contributors detection
  const hasMultipleContributors = useMemo(() => {
    if (!tracks || tracks.length === 0) return false;
    const contributors = new Set<string>();
    for (const track of tracks) {
      if (track.addedBy?.id) {
        contributors.add(track.addedBy.id);
        if (contributors.size > 1) return true;
      }
    }
    return false;
  }, [tracks]);

  usePrefetchContributorProfiles(hasMultipleContributors ? tracks : []);
  const { getProfile } = useUserProfilesCache();

  // Cumulative durations and hour boundaries
  const { cumulativeDurations, hourBoundaries } = useMemo(() => {
    const cumulative: number[] = [];
    const boundaries: Map<number, number> = new Map();
    let runningTotal = 0;
    const ONE_HOUR_MS = 60 * 60 * 1000;
    
    for (let i = 0; i < filteredTracks.length; i++) {
      const track = filteredTracks[i];
      if (!track) continue;
      const prevHours = Math.floor(runningTotal / ONE_HOUR_MS);
      runningTotal += track.durationMs;
      cumulative.push(runningTotal);
      const newHours = Math.floor(runningTotal / ONE_HOUR_MS);
      if (newHours > prevHours) boundaries.set(i, newHours);
    }
    return { cumulativeDurations: cumulative, hourBoundaries: boundaries };
  }, [filteredTracks]);

  // Playback
  const trackUris = useMemo(() => filteredTracks.map((t: Track) => t.uri), [filteredTracks]);
  const playlistUri = playlistId && !isLikedPlaylist ? `spotify:playlist:${playlistId}` : undefined;
  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } = useTrackPlayback({
    trackUris,
    playlistId,
    playlistUri,
  });

  // Compact mode and virtualization
  const isCompact = useHydratedCompactMode();
  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;
  const deferredCount = useDeferredValue(filteredTracks.length);

  const virtualizer = useVirtualizer({
    count: deferredCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => rowHeight,
    overscan: VIRTUALIZATION_OVERSCAN,
  });

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const prevCompactRef = useRef(isCompact);

  useEffect(() => {
    if (prevCompactRef.current !== isCompact) {
      prevCompactRef.current = isCompact;
      const timeoutId = setTimeout(() => virtualizerRef.current.measure(), 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isCompact]);

  const items = virtualizer.getVirtualItems();

  const contextItems = useMemo(() => {
    return filteredTracks.map((t: Track, index: number) => 
      makeCompositeId(panelId, t.id || t.uri, getTrackPosition(t, index))
    );
  }, [filteredTracks, panelId]);

  // Handlers
  const handleSearchChange = useCallback((query: string) => setSearch(panelId, query), [panelId, setSearch]);
  const handleReload = useCallback(() => {
    if (playlistId) eventBus.emit('playlist:reload', { playlistId });
  }, [playlistId]);
  const handleClose = useCallback(() => closePanel(panelId), [panelId, closePanel]);
  const handleSplitHorizontal = useCallback(() => splitPanel(panelId, 'horizontal'), [panelId, splitPanel]);
  const handleSplitVertical = useCallback(() => splitPanel(panelId, 'vertical'), [panelId, splitPanel]);
  const handleDndModeToggle = useCallback(() => {
    setPanelDnDMode(panelId, dndMode === 'move' ? 'copy' : 'move');
  }, [panelId, dndMode, setPanelDnDMode]);
  const handleLockToggle = useCallback(() => togglePanelLock(panelId), [panelId, togglePanelLock]);
  const handleLoadPlaylist = useCallback((newPlaylistId: string) => {
    selectPlaylist(panelId, newPlaylistId);
  }, [panelId, selectPlaylist]);

  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }, [sortKey, sortDirection]);

  const handleDeleteSelected = useCallback(() => {
    if (!playlistId || selection.size === 0) return;
    const uriToPositions = new Map<string, number[]>();
    filteredTracks.forEach((track: Track, index: number) => {
      const key = getTrackSelectionKey(track, index);
      if (selection.has(key)) {
        const position = track.position ?? index;
        const positions = uriToPositions.get(track.uri) || [];
        positions.push(position);
        uriToPositions.set(track.uri, positions);
      }
    });

    const tracksToRemove: Array<{ uri: string; positions: number[] }> = [];
    uriToPositions.forEach((positions, uri) => {
      tracksToRemove.push({ uri, positions });
    });

    if (tracksToRemove.length === 0) return;
    const mutationParams = snapshotId
      ? { playlistId, tracks: tracksToRemove, snapshotId }
      : { playlistId, tracks: tracksToRemove };

    removeTracks.mutate(mutationParams, {
      onSuccess: () => setSelection(panelId, []),
    });
  }, [playlistId, selection, filteredTracks, removeTracks, snapshotId, panelId, setSelection]);

  // Delete handler that auto-selects next track after deletion
  const handleDeleteWithAutoSelect = useCallback((nextIndexToSelect: number | null) => {
    if (!playlistId || selection.size === 0) return;
    const uriToPositions = new Map<string, number[]>();
    filteredTracks.forEach((track: Track, index: number) => {
      const key = getTrackSelectionKey(track, index);
      if (selection.has(key)) {
        const position = track.position ?? index;
        const positions = uriToPositions.get(track.uri) || [];
        positions.push(position);
        uriToPositions.set(track.uri, positions);
      }
    });

    const tracksToRemove: Array<{ uri: string; positions: number[] }> = [];
    uriToPositions.forEach((positions, uri) => {
      tracksToRemove.push({ uri, positions });
    });

    if (tracksToRemove.length === 0) return;
    const mutationParams = snapshotId
      ? { playlistId, tracks: tracksToRemove, snapshotId }
      : { playlistId, tracks: tracksToRemove };

    removeTracks.mutate(mutationParams, {
      onSuccess: () => {
        // Auto-select the next track after deletion
        if (nextIndexToSelect !== null && nextIndexToSelect >= 0) {
          // After tracks are removed, the new track at nextIndexToSelect will have a new index
          // We'll select it using a small delay to let React Query update the cache
          setTimeout(() => {
            const newTracks = queryClient.getQueryData<{ pages: Array<{ items: Track[] }> }>(
              ['playlist', playlistId, 'tracks']
            );
            const allTracks = newTracks?.pages?.flatMap(p => p.items) || [];
            if (allTracks.length > 0 && nextIndexToSelect < allTracks.length) {
              const trackToSelect = allTracks[nextIndexToSelect];
              if (trackToSelect) {
                const newKey = getTrackSelectionKey(trackToSelect, nextIndexToSelect);
                setSelection(panelId, [newKey]);
              }
            } else if (allTracks.length > 0) {
              // If the index is out of bounds, select the last track
              const lastIndex = allTracks.length - 1;
              const trackToSelect = allTracks[lastIndex];
              if (trackToSelect) {
                const newKey = getTrackSelectionKey(trackToSelect, lastIndex);
                setSelection(panelId, [newKey]);
              }
            } else {
              setSelection(panelId, []);
            }
          }, 100);
        } else {
          setSelection(panelId, []);
        }
      },
    });
  }, [playlistId, selection, filteredTracks, removeTracks, snapshotId, panelId, setSelection, queryClient]);

  // Get URIs of selected tracks (for adding to markers)
  const getSelectedTrackUris = useCallback((): string[] => {
    const uris: string[] = [];
    filteredTracks.forEach((track: Track, index: number) => {
      const key = getTrackSelectionKey(track, index);
      if (selection.has(key)) {
        uris.push(track.uri);
      }
    });
    return uris;
  }, [filteredTracks, selection]);

  // Get URIs of all tracks in current sorted order (for saving order)
  const getSortedTrackUris = useCallback((): string[] => {
    return sortedTracks.map((track: Track) => track.uri);
  }, [sortedTracks]);

  // Handler for saving the current sorted order as the new playlist order
  const handleSaveCurrentOrder = useCallback(async () => {
    if (!playlistId || !isEditable) return;
    
    const trackUris = getSortedTrackUris();
    if (trackUris.length === 0) return;

    try {
      await reorderAllTracks.mutateAsync({ playlistId, trackUris });
      // Reset sorting to default after saving
      setSortKey('position');
      setSortDirection('asc');
    } catch (error) {
      console.error('Failed to save playlist order:', error);
    }
  }, [playlistId, isEditable, getSortedTrackUris, reorderAllTracks, setSortKey, setSortDirection]);

  const selectionKey = useCallback((track: Track, index: number) => getTrackSelectionKey(track, index), []);

  // Handler for DEL key - single track deletes without confirmation, multiple with confirmation
  const handleDeleteKeyPress = useCallback((selectionCount: number, nextIndexToSelect: number | null) => {
    if (selectionCount === 1) {
      // Single track: delete immediately without confirmation
      handleDeleteWithAutoSelect(nextIndexToSelect);
    } else {
      // Multiple tracks: the PanelToolbar will show confirmation dialog
      // We expose this via a ref so the toolbar can trigger it
      pendingDeleteNextIndexRef.current = nextIndexToSelect;
      setShowDeleteConfirmation(true);
    }
  }, [handleDeleteWithAutoSelect]);

  // Ref for pending delete next index
  const pendingDeleteNextIndexRef = useRef<number | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  // Handler for confirming multi-track delete (called from toolbar)
  const handleConfirmMultiDelete = useCallback(() => {
    setShowDeleteConfirmation(false);
    handleDeleteWithAutoSelect(pendingDeleteNextIndexRef.current);
    pendingDeleteNextIndexRef.current = null;
  }, [handleDeleteWithAutoSelect]);

  const canDelete = isEditable && !locked && playlistId !== null;

  const { handleTrackClick, handleTrackSelect, handleKeyDownNavigation, focusedIndex } = useTrackListSelection({
    filteredTracks,
    selection,
    panelId,
    setSelection,
    toggleSelection,
    virtualizer,
    selectionKey,
    onDeleteKeyPress: handleDeleteKeyPress,
    canDelete,
  });

  // Auto-reload config
  const { data: configData } = useQuery({
    queryKey: ['app-config'],
    queryFn: async () => {
      const res = await fetch('/api/config');
      if (!res.ok) return { playlistPollIntervalSeconds: null };
      return res.json() as Promise<{ playlistPollIntervalSeconds: number | null }>;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const intervalSeconds = configData?.playlistPollIntervalSeconds;
    if (!intervalSeconds || !playlistId || isLikedPlaylist) return;
    const intervalId = setInterval(() => {
      eventBus.emit('playlist:reload', { playlistId });
    }, intervalSeconds * 1000);
    return () => clearInterval(intervalId);
  }, [configData?.playlistPollIntervalSeconds, playlistId, isLikedPlaylist]);

  // Scroll persistence
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => setScroll(panelId, el.scrollTop);
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [panelId, setScroll]);

  useEffect(() => {
    if (scrollRef.current && panel?.scrollOffset) {
      scrollRef.current.scrollTop = panel.scrollOffset;
    }
  }, [dataUpdatedAt, panel?.scrollOffset]);

  return {
    // Refs
    scrollRef,
    scrollDroppableRef,
    virtualizerRef,

    // State
    playlistId,
    playlistName,
    playlistDescription,
    searchQuery,
    selection,
    locked,
    sortKey,
    sortDirection,
    setSortKey,
    setSortDirection,

    // Data
    tracks,
    filteredTracks,
    snapshotId,
    isLoading,
    isAutoLoading,
    isReloading,
    error,
    isLikedPlaylist,
    hasMultipleContributors,
    cumulativeDurations,
    hourBoundaries,
    duplicateUris,
    selectedDuplicateUris,
    isDuplicate: (uri: string) => duplicateUris.has(uri),
    isOtherInstanceSelected: (uri: string) => selectedDuplicateUris.has(uri),

    // Permissions
    isEditable,
    canDrag,
    canDrop,
    dndMode,

    // Virtualization
    virtualizer,
    items,
    contextItems,
    rowHeight,
    activeMarkerIndices,

    // Playback
    isTrackPlaying,
    isTrackLoading,
    playTrack,
    pausePlayback,
    isLiked,
    handleToggleLiked,
    getProfile,

    // Mutations
    removeTracks,
    lastfmEnabled,

    // Handlers
    handleSearchChange,
    handleReload,
    handleClose,
    handleSplitHorizontal,
    handleSplitVertical,
    handleDndModeToggle,
    handleLockToggle,
    handleLoadPlaylist,
    handleDeleteSelected,
    handleSort,
    handleTrackClick,
    handleTrackSelect,
    handleKeyDownNavigation,
    selectionKey,
    clearInsertionMarkers,
    focusedIndex,
    getSelectedTrackUris,

    // Save current order
    isSorted,
    isSavingOrder: reorderAllTracks.isPending,
    getSortedTrackUris,
    handleSaveCurrentOrder,

    // Delete with confirmation for multi-track (keyboard DEL)
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    handleConfirmMultiDelete,

    // Mouse/keyboard state
    isMouseOver,
    setIsMouseOver,
  };
}
