'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronsUpDown, Heart } from 'lucide-react';
import { isLikedSongsPlaylist } from '@features/playlists/hooks/useLikedVirtualPlaylist';
import { getLikedPlaylistMetadata } from '@features/playlists/hooks/useLikedVirtualPlaylist';
import type { Playlist } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

import {
  usePlaylistPollIntervalMs,
  usePlaylistInfiniteData,
  useFilteredPlaylists,
  useShowLikedSongs,
  getSelectedPlaylistLabel,
  getInitialActiveIndex,
  usePlaylistKeyboardNavigation,
  PlaylistOptionsContent,
} from './playlistSelectorHelpers';

interface PlaylistSelectorProps {
  providerId: MusicProviderId;
  selectedPlaylistId: string | null;
  selectedPlaylistName?: string;
  onSelectPlaylist: (playlistId: string) => void;
  disabled?: boolean;
  /** Container for Popover portal. Use when inside a Dialog to keep popover in the Dialog's DOM tree. */
  popoverContainer?: HTMLElement | null | undefined;
}

export function PlaylistSelector({
  providerId,
  selectedPlaylistId,
  selectedPlaylistName,
  onSelectPlaylist,
  disabled = false,
  popoverContainer,
}: PlaylistSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pollIntervalMs = usePlaylistPollIntervalMs();
  const { allPlaylists, isLoading, isFetching, isFetchingNextPage, refetch } = usePlaylistInfiniteData(pollIntervalMs, providerId, !disabled);
  const filtered = useFilteredPlaylists(allPlaylists, query);
  const showLikedSongs = useShowLikedSongs(query, providerId, !disabled);

  const selected = useMemo(
    () => allPlaylists.find((p: Playlist) => p.id === selectedPlaylistId) || null,
    [allPlaylists, selectedPlaylistId]
  );

  const selectedLabel = getSelectedPlaylistLabel({
    selectedPlaylistId,
    selected,
    selectedPlaylistName,
    providerId,
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
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  // Focus the search input when popover opens
  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => clearTimeout(timer);
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeItem = listRef.current.querySelector<HTMLElement>(`[data-playlist-index="${activeIndex}"]`);
    if (activeItem && typeof activeItem.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen && allPlaylists.length === 0) {
      void refetch();
    }
    if (!nextOpen) {
      setQuery('');
    }
    setOpen(nextOpen);
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
    filtered,
    showLikedSongs,
  });

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-disabled={disabled}
          disabled={disabled}
          className="w-full justify-between"
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
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-2"
        style={{ minWidth: '300px', pointerEvents: 'auto' }}
        container={popoverContainer}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search playlists..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 text-sm mb-2"
        />
        <div ref={listRef} className="max-h-64 overflow-auto">
          <PlaylistOptionsContent
            isLoading={isLoading}
            isFetching={isFetching}
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
      </PopoverContent>
    </Popover>
  );
}
