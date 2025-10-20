/**
 * PlaylistPanel component with virtualized track list, search, and DnD support.
 * Each panel can load a playlist independently and sync with other panels showing the same playlist.
 */

'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tantml:react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { apiFetch } from '@/lib/api/client';
import { playlistTracks, playlistMeta, playlistPermissions } from '@/lib/api/queryKeys';
import { makeCompositeId } from '@/lib/dnd/id';
import { logDebug } from '@/lib/utils/debug';
import { eventBus } from '@/lib/sync/eventBus';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PanelToolbar } from './PanelToolbar';
import { TrackRow } from './TrackRow';
import { TRACK_ROW_HEIGHT, VIRTUALIZATION_OVERSCAN } from './constants';
import type { Track } from '@/lib/spotify/types';
import { Skeleton } from '@/components/ui/skeleton';

interface PlaylistPanelProps {
  panelId: string;
  onRegisterVirtualizer?: (panelId: string, virtualizer: any, scrollRef: React.RefObject<HTMLDivElement>, filteredTracks: Track[]) => void;
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

interface PlaylistTracksData {
  tracks: Track[];
  snapshotId: string;
  total: number;
  nextCursor: string | null;
}

export function PlaylistPanel({ panelId, onRegisterVirtualizer, onUnregisterVirtualizer, isActiveDropTarget, dropIndicatorIndex, ephemeralInsertion }: PlaylistPanelProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const playlistIdRef = useRef<string | null>(null);
  
  const panel = useSplitGridStore((state) => 
    state.panels.find((p) => p.id === panelId)
  );
  
  const setSearch = useSplitGridStore((state) => state.setSearch);
  const setSelection = useSplitGridStore((state) => state.setSelection);
  const toggleSelection = useSplitGridStore((state) => state.toggleSelection);
  const setScroll = useSplitGridStore((state) => state.setScroll);
  const closePanel = useSplitGridStore((state) => state.closePanel);
  const clonePanel = useSplitGridStore((state) => state.clonePanel);
  const setPanelDnDMode = useSplitGridStore((state) => state.setPanelDnDMode);
  const togglePanelLock = useSplitGridStore((state) => state.togglePanelLock);
  const loadPlaylist = useSplitGridStore((state) => state.loadPlaylist);
  const selectPlaylist = useSplitGridStore((state) => state.selectPlaylist);

  const [playlistName, setPlaylistName] = useState<string>('');

  const playlistId = panel?.playlistId;
  const searchQuery = panel?.searchQuery || '';
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 150);
  const selection = panel?.selection || new Set();

  // Panel-level droppable for hover detection (gaps, padding, background)
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `panel-${panelId}`,
    data: {
      type: 'panel',
      panelId,
      playlistId,
    },
  });

  // Update ref when playlistId changes
  useEffect(() => {
    if (playlistId) {
      playlistIdRef.current = playlistId;
    }
  }, [playlistId]);

  // Fetch playlist tracks with stable query key
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: playlistIdRef.current ? playlistTracks(playlistIdRef.current) : ['playlist-tracks', null],
    queryFn: async (): Promise<PlaylistTracksData> => {
      if (!playlistIdRef.current) throw new Error('No playlist ID');
      return apiFetch(`/api/playlists/${playlistId}/tracks`);
    },
    enabled: !!playlistId,
    staleTime: 30000, // 30 seconds
  });

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
  const locked = panel?.locked || false;

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
        refetch();
      }
    });

    const unsubscribeReload = eventBus.on('playlist:reload', ({ playlistId: id }) => {
      if (id === playlistId) {
        // Save scroll position
        const scrollTop = scrollRef.current?.scrollTop || 0;
        setScroll(panelId, scrollTop);
        
        refetch().then(() => {
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
  }, [playlistId, panelId, refetch, setScroll]);

  // Filter tracks based on search
  const filteredTracks = useMemo(() => {
    if (!data?.tracks) return [];
    if (!searchQuery.trim()) return data.tracks;

    const query = searchQuery.toLowerCase();
    return data.tracks.filter(
      (track) =>
        track.name.toLowerCase().includes(query) ||
        track.artists.some((artist) => artist.toLowerCase().includes(query)) ||
        track.album?.name?.toLowerCase().includes(query)
    );
  }, [data?.tracks, searchQuery]);

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
    const baseItems = filteredTracks.map((t) => makeCompositeId(panelId, t.id || t.uri));
    
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

  const handleLoadPlaylist = useCallback(
    (newPlaylistId: string) => {
      selectPlaylist(panelId, newPlaylistId);
    },
    [panelId, selectPlaylist]
  );

  const handleTrackClick = useCallback(
    (trackId: string) => {
      setSelection(panelId, [trackId]);
    },
    [panelId, setSelection]
  );

  const handleTrackSelect = useCallback(
    (trackId: string, event: React.MouseEvent) => {
      if (event.shiftKey) {
        // Range selection
        const tracks = filteredTracks.map((t) => t.id || t.uri);
        const currentIndex = tracks.indexOf(trackId);
        const lastSelectedIndex = tracks.findIndex((id) => selection.has(id));
        
        if (lastSelectedIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(currentIndex, lastSelectedIndex);
          const end = Math.max(currentIndex, lastSelectedIndex);
          const range = tracks.slice(start, end + 1);
          setSelection(panelId, range);
        }
      } else if (event.ctrlKey || event.metaKey) {
        // Toggle selection
        toggleSelection(panelId, trackId);
      } else {
        setSelection(panelId, [trackId]);
      }
    },
    [panelId, filteredTracks, selection, setSelection, toggleSelection]
  );

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
  }, [data, panel?.scrollOffset]);

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
        onSearchChange={handleSearchChange}
        onReload={handleReload}
        onClose={handleClose}
        onSplitHorizontal={handleSplitHorizontal}
        onSplitVertical={handleSplitVertical}
        onDndModeToggle={handleDndModeToggle}
        onLockToggle={handleLockToggle}
        onLoadPlaylist={handleLoadPlaylist}
      />

      <div ref={scrollRef} data-testid="track-list-scroll" className="flex-1 overflow-auto">
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
              {/* Visual drop indicator line - show during any drag with valid filtered index */}
              {dropIndicatorIndex !== null && dropIndicatorIndex !== undefined && (() => {
                logDebug('[PlaylistPanel] Rendering drop indicator:', {
                  panelId,
                  dropIndicatorIndex,
                  itemsCount: items.length,
                  filteredTracksCount: filteredTracks.length,
                });
                
                // Directly use the filtered index to find the virtual item
                const virtualItem = items.find(item => item.index === dropIndicatorIndex);
                
                if (!virtualItem) {
                  logDebug('[PlaylistPanel] No virtual item found, trying last track');
                  // Dropping after last visible track
                  const lastIndex = filteredTracks.length - 1;
                  if (lastIndex >= 0) {
                    const lastVirtualItem = items.find(item => item.index === lastIndex);
                    if (lastVirtualItem) {
                      const dropY = lastVirtualItem.start + lastVirtualItem.size;
                      logDebug('[PlaylistPanel] Rendering indicator after last track at Y:', dropY);
                      return (
                        <div
                          data-drop-indicator="after-last"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '4px',
                            backgroundColor: '#3b82f6',
                            transform: `translateY(${dropY}px)`,
                            zIndex: 40,
                            pointerEvents: 'none',
                            boxShadow: '0 0 8px rgba(59, 130, 246, 0.8)',
                          }}
                        />
                      );
                    }
                  }
                  logDebug('[PlaylistPanel] Could not render indicator - no virtual items');
                  return null;
                }
                
                logDebug('[PlaylistPanel] Rendering indicator at virtual item:', {
                  index: virtualItem.index,
                  start: virtualItem.start,
                });
                
                return (
                  <div
                    data-drop-indicator="at-index"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '4px',
                      backgroundColor: '#3b82f6',
                      transform: `translateY(${virtualItem.start}px)`,
                      zIndex: 40,
                      pointerEvents: 'none',
                      boxShadow: '0 0 8px rgba(59, 130, 246, 0.8)',
                    }}
                  />
                );
              })()}

              {items.map((virtualRow) => {
                const track = filteredTracks[virtualRow.index];
                if (!track) return null;
                
                const trackId = track.id || track.uri;

                return (
                  <div
                    key={trackId}
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
                      isSelected={selection.has(trackId)}
                      isEditable={isEditable}
                      locked={locked}
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
        )}
      </div>
    </div>
  );
}
