'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronsUpDown, Heart } from 'lucide-react';
import { isLikedSongsPlaylist } from '@/hooks/useLikedVirtualPlaylist';
import type { Playlist } from '@/lib/music-provider/types';

import {
  usePlaylistPollIntervalMs,
  usePlaylistInfiniteData,
  useFilteredPlaylists,
  useShowLikedSongs,
  getSelectedPlaylistLabel,
  useCloseOnOutsideClick,
  useDropdownPositionOnOpen,
  getInitialActiveIndex,
  usePlaylistKeyboardNavigation,
  PlaylistSelectorDropdown,
} from './playlistSelectorHelpers';

interface PlaylistSelectorProps {
  selectedPlaylistId: string | null;
  selectedPlaylistName?: string;
  onSelectPlaylist: (playlistId: string) => void;
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