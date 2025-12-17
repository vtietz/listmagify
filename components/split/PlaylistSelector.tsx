/**
 * PlaylistSelector component: A dropdown with search to select a playlist.
 * Fetches user's playlists (infinite), filters client-side, and updates panel.
 */

'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronsUpDown, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { userPlaylists } from '@/lib/api/queryKeys';
import { cn } from '@/lib/utils';
import type { Playlist } from '@/lib/spotify/types';

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

export function PlaylistSelector({ selectedPlaylistId, selectedPlaylistName, onSelectPlaylist }: PlaylistSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: userPlaylists(),
    queryFn: async ({ pageParam = null }): Promise<PlaylistsResponse> => {
      const url = pageParam
        ? `/api/me/playlists?nextCursor=${encodeURIComponent(pageParam as string)}`
        : '/api/me/playlists';
      return apiFetch<PlaylistsResponse>(url);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null,
    staleTime: 60_000,
  });

  // Auto-load all playlists on mount
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allPlaylists = useMemo(() => {
    if (!data?.pages) return [];
    const all = data.pages.flatMap((p) => p.items);
    // Deduplicate by playlist ID (pagination can return duplicates)
    const seen = new Set<string>();
    return all.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base = q
      ? allPlaylists.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.owner?.displayName?.toLowerCase().includes(q))
        )
      : allPlaylists;

    // Sort by name ascending (case-insensitive)
    return [...base].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, [allPlaylists, query]);

  const selected = useMemo(
    () => allPlaylists.find((p) => p.id === selectedPlaylistId) || null,
    [allPlaylists, selectedPlaylistId]
  );

  // Close on outside click
  // Using 'click' instead of 'mousedown' allows the dropdown item's onClick to fire first
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      // Check if click is inside any of our components using composedPath
      const path = e.composedPath();
      const isInsideContainer = containerRef.current && path.includes(containerRef.current);
      const isInsideButton = buttonRef.current && path.includes(buttonRef.current);
      const isInsideDropdown = dropdownRef.current && path.includes(dropdownRef.current);
      
      if (isInsideContainer || isInsideButton || isInsideDropdown) {
        return;
      }
      
      setOpen(false);
    }
    if (open) {
      document.addEventListener('click', onDocClick);
    }
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleToggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (next && allPlaylists.length === 0) {
        // Ensure we have initial data when opening
        refetch();
      }
      // Update dropdown position when opening
      if (next && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + 4, // 4px gap
          left: rect.left,
          width: rect.width,
        });
      }
      return next;
    });
  }, [refetch, allPlaylists.length]);

  const handleSelect = useCallback(
    (playlistId: string) => {
      onSelectPlaylist(playlistId);
      setOpen(false);
      setQuery('');
    },
    [onSelectPlaylist]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[activeIndex];
        if (item) handleSelect(item.id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    },
    [filtered, activeIndex, handleSelect, open]
  );

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
        <span className="truncate">
          {selectedPlaylistName || selected?.name || 'Select a playlist...'}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${Math.max(dropdownPosition.width, 300)}px`,
            zIndex: 9999,
          }}
          className="rounded-md border border-border bg-card p-2 shadow-md"
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
            {isLoading && allPlaylists.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">No playlists found.</div>
            ) : (
              <>
                {filtered.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelect(p.id)}
                    className={cn(
                      'w-full text-left px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground',
                      idx === activeIndex ? 'bg-accent text-accent-foreground' : ''
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Check
                        className={cn(
                          'mt-0.5 h-4 w-4',
                          selectedPlaylistId === p.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="min-w-0">
                        <div className="truncate">{p.name}</div>
                        {p.owner?.displayName && (
                          <div className="text-xs text-muted-foreground truncate">
                            {p.owner.displayName}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
                
                {/* Show loading indicator when auto-loading more playlists */}
                {isFetchingNextPage && (
                  <div className="p-2 text-xs text-muted-foreground text-center">
                    Loading more... ({allPlaylists.length} loaded)
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}