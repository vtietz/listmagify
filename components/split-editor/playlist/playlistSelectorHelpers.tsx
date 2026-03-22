'use client';

import { useState, useEffect, useMemo, useCallback, type Dispatch, type SetStateAction, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Check, Heart } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { userPlaylistsByProvider } from '@/lib/api/queryKeys';
import { cn, matchesAllWords } from '@/lib/utils';
import { LIKED_SONGS_PLAYLIST_ID, getLikedPlaylistMetadata, isLikedSongsPlaylist } from '@/hooks/useLikedVirtualPlaylist';
import type { Playlist } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

interface PlaylistsResponse {
  items: Playlist[];
  nextCursor: string | null;
  total: number;
}

export function usePlaylistPollIntervalMs() {
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

export function usePlaylistInfiniteData(pollIntervalMs: number | undefined, providerId: MusicProviderId) {
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: userPlaylistsByProvider(providerId),
    queryFn: async ({ pageParam }: { pageParam: string | null }): Promise<PlaylistsResponse> => {
      const url = pageParam
        ? `/api/me/playlists?nextCursor=${encodeURIComponent(pageParam)}&provider=${providerId}`
        : `/api/me/playlists?provider=${providerId}`;
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

export function useFilteredPlaylists(allPlaylists: Playlist[], query: string) {
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

export function useShowLikedSongs(query: string, providerId: MusicProviderId) {
  const likedPlaylistMetadata = getLikedPlaylistMetadata(providerId);

  return useMemo(() => {
    const normalizedQuery = query.trim();

    return !normalizedQuery
      || matchesAllWords(likedPlaylistMetadata.name, normalizedQuery)
      || matchesAllWords('liked', normalizedQuery)
      || matchesAllWords('saved', normalizedQuery);
  }, [query, likedPlaylistMetadata]);
}

export function getSelectedPlaylistLabel({
  selectedPlaylistId,
  selected,
  selectedPlaylistName,
  providerId,
}: {
  selectedPlaylistId: string | null;
  selected: Playlist | null;
  selectedPlaylistName: string | undefined;
  providerId: MusicProviderId;
}) {
  if (isLikedSongsPlaylist(selectedPlaylistId)) {
    return getLikedPlaylistMetadata(providerId).name;
  }

  return selected?.name || selectedPlaylistName || 'Select a playlist...';
}

export function useCloseOnOutsideClick({
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

export function useDropdownPositionOnOpen(
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

export function getInitialActiveIndex({
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

export function usePlaylistKeyboardNavigation({
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
  setActiveIndex: Dispatch<SetStateAction<number>>;
  handleSelect: (playlistId: string) => void;
  onEscape: () => void;
  filtered: Playlist[];
  showLikedSongs: boolean;
}) {
  return useCallback((event: KeyboardEvent<HTMLInputElement>) => {
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
        <Check className={cn('mt-0.5 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
        <div className="min-w-0">
          <div className="truncate">{playlist.name}</div>
          {playlist.owner?.displayName && (
            <div className="text-xs text-muted-foreground truncate">{playlist.owner.displayName}</div>
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
  likedPlaylistName,
  filtered,
  activeIndex,
  selectedPlaylistId,
  handleSelect,
  isFetchingNextPage,
}: {
  isLoading: boolean;
  allPlaylistsLength: number;
  showLikedSongs: boolean;
  likedPlaylistName: string;
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
              <div className="truncate">{likedPlaylistName}</div>
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

export function PlaylistSelectorDropdown({
  open,
  dropdownRef,
  dropdownPosition,
  query,
  setQuery,
  handleKeyDown,
  isLoading,
  allPlaylists,
  showLikedSongs,
  providerId,
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
  setQuery: Dispatch<SetStateAction<string>>;
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  allPlaylists: Playlist[];
  showLikedSongs: boolean;
  providerId: MusicProviderId;
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
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <Input
        autoFocus
        type="text"
        placeholder="Search playlists..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        className="h-8 text-sm mb-2"
      />

      <div className="max-h-64 overflow-auto">
        <PlaylistOptionsContent
          isLoading={isLoading}
          allPlaylistsLength={allPlaylists.length}
          showLikedSongs={showLikedSongs}
          likedPlaylistName={getLikedPlaylistMetadata(providerId).name}
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