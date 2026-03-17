/**
 * PlaylistSelector component: A dropdown with search to select a playlist.
 * Fetches user's playlists (infinite), filters client-side, and updates panel.
 */

'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronsUpDown, Check, Heart } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { userPlaylists } from '@/lib/api/queryKeys';
import { cn, matchesAllWords } from '@/lib/utils';
import { LIKED_SONGS_PLAYLIST_ID, LIKED_SONGS_METADATA, isLikedSongsPlaylist } from '@/hooks/useLikedVirtualPlaylist';
import type { Playlist } from '@/lib/music-provider/types';

interface PlaylistSelectorProps {
  selectedPlaylistId: string | null;
  selectedPlaylistName?: string; // Display name for the selected playlist
  onSelectPlaylist: (playlistId: string) => void;
}

interface PlaylistsResponse {
  items: Playlist[];
  nextCursor: string | null;
  total: number;
}

function usePlaylistPollIntervalMs() {
  const { data: configData } = useQuery({
    queryKey: ['app-config'],
    queryFn: async () => {
      const response = await fetch('/api/config');
      if (!response.ok) {
        return { playlistPollIntervalSeconds: null };
      }

      return response.json() as Promise<{ playlistPollIntervalSeconds: number | null }>;
    },
    staleTime: Infinity,
  });

  return configData?.playlistPollIntervalSeconds
    ? configData.playlistPollIntervalSeconds * 1000
    : undefined;
}

function usePlaylistInfiniteData(pollIntervalMs: number | undefined) {
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: userPlaylists(),
    queryFn: async ({ pageParam }: { pageParam: string | null }): Promise<PlaylistsResponse> => {
      const url = pageParam
        ? `/api/me/playlists?nextCursor=${encodeURIComponent(pageParam)}`
        : '/api/me/playlists';
      return apiFetch<PlaylistsResponse>(url);
    },
    getNextPageParam: (lastPage: PlaylistsResponse) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    staleTime: 60_000,
    refetchInterval: pollIntervalMs,
  });

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allPlaylists = useMemo(() => {
    if (!data?.pages) {
      return [];
    }

    const all = data.pages.flatMap((page: PlaylistsResponse) => page.items);
    const seen = new Set<string>();

    return all.filter((playlist: Playlist) => {
      if (seen.has(playlist.id)) {
        return false;
      }

      seen.add(playlist.id);
      return true;
    });
  }, [data]);

  return {
    allPlaylists,
    isLoading,
    isFetchingNextPage,
    refetch,
  };
}

function useFilteredPlaylists(allPlaylists: Playlist[], query: string) {
  return useMemo(() => {
    const normalizedQuery = query.trim();

    const basePlaylists = normalizedQuery
      ? allPlaylists.filter(
          (playlist: Playlist) =>
            matchesAllWords(playlist.name, normalizedQuery) ||
            (playlist.owner?.displayName && matchesAllWords(playlist.owner.displayName, normalizedQuery))
        )
      : allPlaylists;

    return [...basePlaylists].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, [allPlaylists, query]);
}

function useShowLikedSongs(query: string) {
  return useMemo(() => {
    const normalizedQuery = query.trim();

    return !normalizedQuery
      || matchesAllWords(LIKED_SONGS_METADATA.name, normalizedQuery)
      || matchesAllWords('liked', normalizedQuery)
      || matchesAllWords('saved', normalizedQuery);
  }, [query]);
}

function getSelectedPlaylistLabel({
  selectedPlaylistId,
  selected,
  selectedPlaylistName,
}: {
  selectedPlaylistId: string | null;
  selected: Playlist | null;
  selectedPlaylistName: string | undefined;
}) {
  if (isLikedSongsPlaylist(selectedPlaylistId)) {
    return LIKED_SONGS_METADATA.name;
  }

  return selected?.name || selectedPlaylistName || 'Select a playlist...';
}

function useCloseOnOutsideClick({
  open,
  containerRef,
  buttonRef,
  dropdownRef,
  onClose,
}: {
  open: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const path = event.composedPath();
      const isInsideContainer = containerRef.current ? path.includes(containerRef.current) : false;
      const isInsideButton = buttonRef.current ? path.includes(buttonRef.current) : false;
      const isInsideDropdown = dropdownRef.current ? path.includes(dropdownRef.current) : false;

      if (isInsideContainer || isInsideButton || isInsideDropdown) {
        return;
      }

      onClose();
    };

    if (open) {
      document.addEventListener('click', onDocumentClick);
    }

    return () => document.removeEventListener('click', onDocumentClick);
  }, [open, containerRef, buttonRef, dropdownRef, onClose]);
}

function useDropdownPositionOnOpen(
  open: boolean,
  buttonRef: React.RefObject<HTMLButtonElement | null>
) {
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!open || !buttonRef.current) {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [open, buttonRef]);

  return dropdownPosition;
}

function getInitialActiveIndex({
  selectedPlaylistId,
  filtered,
  showLikedSongs,
}: {
  selectedPlaylistId: string | null;
  filtered: Playlist[];
  showLikedSongs: boolean;
}) {
  if (isLikedSongsPlaylist(selectedPlaylistId) && showLikedSongs) {
    return 0;
  }

  const playlistIndex = filtered.findIndex((playlist) => playlist.id === selectedPlaylistId);
  if (playlistIndex < 0) {
    return 0;
  }

  return showLikedSongs ? playlistIndex + 1 : playlistIndex;
}

function getPlaylistIdFromIndex({
  activeIndex,
  showLikedSongs,
  filtered,
}: {
  activeIndex: number;
  showLikedSongs: boolean;
  filtered: Playlist[];
}) {
  if (showLikedSongs && activeIndex === 0) {
    return LIKED_SONGS_PLAYLIST_ID;
  }

  const playlistIndex = showLikedSongs ? activeIndex - 1 : activeIndex;
  return filtered[playlistIndex]?.id;
}

function usePlaylistKeyboardNavigation({
  open,
  totalItems,
  activeIndex,
  setActiveIndex,
  handleSelect,
  onEscape,
  filtered,
  showLikedSongs,
}: {
  open: boolean;
  totalItems: number;
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  handleSelect: (playlistId: string) => void;
  onEscape: () => void;
  filtered: Playlist[];
  showLikedSongs: boolean;
}) {
  return useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, Math.max(totalItems - 1, 0)));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const playlistId = getPlaylistIdFromIndex({ activeIndex, showLikedSongs, filtered });
        if (playlistId) {
          handleSelect(playlistId);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        onEscape();
        break;
      default:
        break;
    }
  }, [open, totalItems, activeIndex, setActiveIndex, handleSelect, onEscape, filtered, showLikedSongs]);
}

function PlaylistOption({
  playlist,
  dataIndex,
  isActive,
  isSelected,
  onSelect,
}: {
  playlist: Playlist;
  dataIndex: number;
  isActive: boolean;
  isSelected: boolean;
  onSelect: (playlistId: string) => void;
}) {
  return (
    <button
      key={playlist.id}
      type="button"
      data-playlist-index={dataIndex}
      onClick={() => onSelect(playlist.id)}
      className={cn(
        'w-full text-left px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground',
        isActive ? 'bg-accent text-accent-foreground' : ''
      )}
    >
      <div className="flex items-start gap-2">
        <Check
          className={cn(
            'mt-0.5 h-4 w-4',
            isSelected ? 'opacity-100' : 'opacity-0'
          )}
        />
        <div className="min-w-0">
          <div className="truncate">{playlist.name}</div>
          {playlist.owner?.displayName && (
            <div className="text-xs text-muted-foreground truncate">
              {playlist.owner.displayName}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function PlaylistOptionsContent({
  isLoading,
  allPlaylistsLength,
  showLikedSongs,
  filtered,
  activeIndex,
  selectedPlaylistId,
  handleSelect,
  isFetchingNextPage,
}: {
  isLoading: boolean;
  allPlaylistsLength: number;
  showLikedSongs: boolean;
  filtered: Playlist[];
  activeIndex: number;
  selectedPlaylistId: string | null;
  handleSelect: (playlistId: string) => void;
  isFetchingNextPage: boolean;
}) {
  if (isLoading && allPlaylistsLength === 0) {
    return <div className="p-2 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!showLikedSongs && filtered.length === 0) {
    return <div className="p-2 text-sm text-muted-foreground">No playlists found.</div>;
  }

  return (
    <>
      {showLikedSongs && (
        <button
          key={LIKED_SONGS_PLAYLIST_ID}
          type="button"
          data-playlist-index={0}
          onClick={() => handleSelect(LIKED_SONGS_PLAYLIST_ID)}
          className={cn(
            'w-full text-left px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground',
            activeIndex === 0 ? 'bg-accent text-accent-foreground' : ''
          )}
        >
          <div className="flex items-start gap-2">
            <Check
              className={cn(
                'mt-0.5 h-4 w-4',
                isLikedSongsPlaylist(selectedPlaylistId) ? 'opacity-100' : 'opacity-0'
              )}
            />
            <div className="min-w-0 flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5 fill-[#9759f5] text-[#9759f5] shrink-0" />
              <div className="truncate">{LIKED_SONGS_METADATA.name}</div>
            </div>
          </div>
        </button>
      )}

      {filtered.map((playlist, index) => {
        const dataIndex = showLikedSongs ? index + 1 : index;
        return (
          <PlaylistOption
            key={playlist.id}
            playlist={playlist}
            dataIndex={dataIndex}
            isActive={dataIndex === activeIndex}
            isSelected={selectedPlaylistId === playlist.id}
            onSelect={handleSelect}
          />
        );
      })}

      {isFetchingNextPage && (
        <div className="p-2 text-xs text-muted-foreground text-center">
          Loading more... ({allPlaylistsLength} loaded)
        </div>
      )}
    </>
  );
}

function PlaylistSelectorDropdown({
  open,
  dropdownRef,
  dropdownPosition,
  query,
  setQuery,
  handleKeyDown,
  isLoading,
  allPlaylists,
  showLikedSongs,
  filtered,
  activeIndex,
  selectedPlaylistId,
  handleSelect,
  isFetchingNextPage,
}: {
  open: boolean;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  dropdownPosition: { top: number; left: number; width: number };
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  allPlaylists: Playlist[];
  showLikedSongs: boolean;
  filtered: Playlist[];
  activeIndex: number;
  selectedPlaylistId: string | null;
  handleSelect: (playlistId: string) => void;
  isFetchingNextPage: boolean;
}) {
  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`,
        width: `${Math.max(dropdownPosition.width, 300)}px`,
        zIndex: 99999,
      }}
      className="rounded-md border border-border bg-card p-2 shadow-md pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Input
        autoFocus
        type="text"
        placeholder="Search playlists..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-8 text-sm mb-2"
      />

      <div className="max-h-64 overflow-auto">
        <PlaylistOptionsContent
          isLoading={isLoading}
          allPlaylistsLength={allPlaylists.length}
          showLikedSongs={showLikedSongs}
          filtered={filtered}
          activeIndex={activeIndex}
          selectedPlaylistId={selectedPlaylistId}
          handleSelect={handleSelect}
          isFetchingNextPage={isFetchingNextPage}
        />
      </div>
    </div>,
    document.body
  );
}

export function PlaylistSelector({ selectedPlaylistId, selectedPlaylistName, onSelectPlaylist }: PlaylistSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const pollIntervalMs = usePlaylistPollIntervalMs();
  const { allPlaylists, isLoading, isFetchingNextPage, refetch } = usePlaylistInfiniteData(pollIntervalMs);
  const dropdownPosition = useDropdownPositionOnOpen(open, buttonRef);
  const filtered = useFilteredPlaylists(allPlaylists, query);
  const showLikedSongs = useShowLikedSongs(query);

  const selected = useMemo(
    () => allPlaylists.find((p: Playlist) => p.id === selectedPlaylistId) || null,
    [allPlaylists, selectedPlaylistId]
  );

  const selectedLabel = getSelectedPlaylistLabel({
    selectedPlaylistId,
    selected,
    selectedPlaylistName,
  });

  useCloseOnOutsideClick({
    open,
    containerRef,
    buttonRef,
    dropdownRef,
    onClose: () => setOpen(false),
  });

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveIndex(getInitialActiveIndex({
      selectedPlaylistId,
      filtered,
      showLikedSongs,
    }));
  }, [open, selectedPlaylistId, filtered, showLikedSongs]);

  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const activeItem = dropdownRef.current.querySelector<HTMLElement>(`[data-playlist-index="${activeIndex}"]`);
    if (activeItem && typeof activeItem.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const handleToggle = useCallback(() => {
    setOpen((isOpen) => {
      const next = !isOpen;
      if (next && allPlaylists.length === 0) {
        void refetch();
      }
      return next;
    });
  }, [refetch, allPlaylists.length]);

  const handleSelect = useCallback(
    (playlistId: string) => {
      onSelectPlaylist(playlistId);
      setOpen(false);
    },
    [onSelectPlaylist]
  );

  // Total items: Liked Songs (if shown) + filtered playlists
  const totalItems = (showLikedSongs ? 1 : 0) + filtered.length;

  const handleKeyDown = usePlaylistKeyboardNavigation({
    open,
    totalItems,
    activeIndex,
    setActiveIndex,
    handleSelect,
    onEscape: () => setOpen(false),
    filtered,
    showLikedSongs,
  });

  return (
    <div ref={containerRef} className="relative inline-block w-full">
      <Button
        ref={buttonRef}
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between"
        onClick={handleToggle}
        title="Select playlist"
      >
        <span className="truncate flex items-center gap-1.5">
          {isLikedSongsPlaylist(selectedPlaylistId) && (
            <Heart className="h-3.5 w-3.5 fill-[#9759f5] text-[#9759f5] shrink-0" />
          )}
          {selectedLabel}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      <PlaylistSelectorDropdown
        open={open}
        dropdownRef={dropdownRef}
        dropdownPosition={dropdownPosition}
        query={query}
        setQuery={setQuery}
        handleKeyDown={handleKeyDown}
        isLoading={isLoading}
        allPlaylists={allPlaylists}
        showLikedSongs={showLikedSongs}
        filtered={filtered}
        activeIndex={activeIndex}
        selectedPlaylistId={selectedPlaylistId}
        handleSelect={handleSelect}
        isFetchingNextPage={isFetchingNextPage}
      />
    </div>
  );
}