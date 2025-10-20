/**
 * PlaylistPanel component with virtualized track list, search, and DnD support.
 * Each panel can load a playlist independently and sync with other panels showing the same playlist.
 */

'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { apiFetch } from '@/lib/api/client';
import { eventBus } from '@/lib/sync/eventBus';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { PanelToolbar } from './PanelToolbar';
import { TrackRow } from './TrackRow';
import type { Track } from '@/lib/spotify/types';
import { Skeleton } from '@/components/ui/skeleton';
import { checkPlaylistEditable } from '@/lib/spotify/playlistMutations';

interface PlaylistPanelProps {
  panelId: string;
}

interface PlaylistTracksData {
  tracks: Track[];
  snapshotId: string;
  total: number;
  nextCursor: string | null;
}

export function PlaylistPanel({ panelId }: PlaylistPanelProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const panel = useSplitGridStore((state) => 
    state.panels.find((p) => p.id === panelId)
  );
  
  const setSearch = useSplitGridStore((state) => state.setSearch);
  const setSelection = useSplitGridStore((state) => state.setSelection);
  const toggleSelection = useSplitGridStore((state) => state.toggleSelection);
  const setScroll = useSplitGridStore((state) => state.setScroll);
  const closePanel = useSplitGridStore((state) => state.closePanel);
  const loadPlaylist = useSplitGridStore((state) => state.loadPlaylist);

  const [playlistName, setPlaylistName] = useState<string>('');

  const playlistId = panel?.playlistId;
  const searchQuery = panel?.searchQuery || '';
  const selection = panel?.selection || new Set();
  const isEditable = panel?.isEditable || false;

  // Fetch playlist tracks
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['playlist-tracks', playlistId],
    queryFn: async (): Promise<PlaylistTracksData> => {
      if (!playlistId) throw new Error('No playlist ID');
      return apiFetch(`/api/playlists/${playlistId}/tracks`);
    },
    enabled: !!playlistId,
    staleTime: 30000, // 30 seconds
  });

  // Fetch playlist metadata for name
  useEffect(() => {
    if (!playlistId) return;

    const fetchPlaylist = async () => {
      try {
        const result = await apiFetch<{ name: string }>(`/api/me/playlists`);
        // This is a hack - we need a separate endpoint for single playlist
        // For now, just use the playlist ID as the name
        setPlaylistName(`Playlist ${playlistId.slice(0, 8)}`);
      } catch (err) {
        console.error('Failed to fetch playlist name:', err);
      }
    };

    fetchPlaylist();
  }, [playlistId]);

  // Check permissions and update store
  useEffect(() => {
    if (!playlistId) return;

    const checkPermissions = async () => {
      const editable = await checkPlaylistEditable(playlistId);
      loadPlaylist(panelId, playlistId, editable);
    };

    checkPermissions();
  }, [playlistId, panelId, loadPlaylist]);

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

  // Virtualization
  const virtualizer = useVirtualizer({
    count: filteredTracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  const items = virtualizer.getVirtualItems();

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
          searchQuery=""
          onSearchChange={() => {}}
          onReload={() => {}}
          onClose={handleClose}
        />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>Select a playlist to load</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden bg-card">
      <PanelToolbar
        panelId={panelId}
        playlistId={playlistId}
        playlistName={playlistName}
        isEditable={isEditable}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onReload={handleReload}
        onClose={handleClose}
      />

      <div ref={scrollRef} className="flex-1 overflow-auto">
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
            items={filteredTracks.map((t) => t.id || t.uri)}
            strategy={verticalListSortingStrategy}
          >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
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
                      onSelect={handleTrackSelect}
                      onClick={handleTrackClick}
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
