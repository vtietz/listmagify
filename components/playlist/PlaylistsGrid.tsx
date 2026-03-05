"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Playlist } from "@/lib/spotify/types";
import { PlaylistCard } from "@/components/playlist/PlaylistCard";
import { PlaylistListItem } from "@/components/playlist/PlaylistListItem";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useAutoLoadPaginated } from "@/hooks/useAutoLoadPaginated";
import { LIKED_SONGS_METADATA } from "@/hooks/useLikedVirtualPlaylist";
import { useLikedSongsTotal } from "@/hooks/useSavedTracksIndex";
import { useCompactModeStore } from "@/hooks/useCompactModeStore";
import { matchesAllWords } from "@/lib/utils";

export interface PlaylistsGridProps {
  initialItems: Playlist[];
  initialNextCursor: string | null;
  searchTerm: string;
  isRefreshing: boolean;
  onRefreshComplete: (items: Playlist[], nextCursor: string | null) => void;
  newlyCreatedPlaylist?: Playlist | null;
  onNewPlaylistAdded?: () => void;
}

/**
 * Grid display for playlists with auto-loading and client-side filtering.
 * 
 * Features:
 * - Auto-loads all playlists on mount for instant search
 * - Client-side search filtering by name and owner
 * - Progressive loading UI updates
 * - Refresh support with parent callback
 */
export function PlaylistsGrid({
  initialItems,
  initialNextCursor,
  searchTerm,
  isRefreshing,
  onRefreshComplete,
  newlyCreatedPlaylist,
  onNewPlaylistAdded,
}: PlaylistsGridProps) {
  const { isCompact } = useCompactModeStore();
  const handledPlaylistIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef(false);
  
  // Auto-load all playlists for instant search
  const { items, isAutoLoading, setItems, setNextCursor } = useAutoLoadPaginated({
    initialItems,
    initialNextCursor,
    endpoint: "/api/me/playlists",
    itemsKey: "items",
  });

  // Get cached liked songs total (fetches on mount if not cached)
  const likedSongsTotal = useLikedSongsTotal();

  // Add newly created playlist to items immediately for instant feedback
  useEffect(() => {
    if (!newlyCreatedPlaylist) {
      handledPlaylistIdRef.current = null;
      return;
    }

    if (handledPlaylistIdRef.current === newlyCreatedPlaylist.id) {
      return;
    }

    const exists = items.some((item) => item.id === newlyCreatedPlaylist.id);
    if (!exists) {
      setItems([newlyCreatedPlaylist, ...items]);
    }

    handledPlaylistIdRef.current = newlyCreatedPlaylist.id;
    onNewPlaylistAdded?.();
  }, [newlyCreatedPlaylist, items, setItems, onNewPlaylistAdded]);

  // Handle refresh from parent
  useEffect(() => {
    if (!isRefreshing || refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    let cancelled = false;

    const fetchInitial = async () => {
      try {
        const data = await apiFetch<{ items: Playlist[]; nextCursor: string | null }>("/api/me/playlists");
        if (cancelled) return;

        setItems(data.items || []);
        setNextCursor(data.nextCursor);
        onRefreshComplete(data.items || [], data.nextCursor);
      } catch (error) {
        if (cancelled) return;

        if (error instanceof ApiError && !error.isUnauthorized) {
          onRefreshComplete(items, null);
        }
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    fetchInitial();

    return () => {
      cancelled = true;
    };
  }, [isRefreshing, items, setItems, setNextCursor, onRefreshComplete]);

  // Virtual playlist for Liked Songs (shown first)
  // Uses cached total from saved tracks index (populated when user visits split-editor)
  const likedSongsPlaylist: Playlist = useMemo(() => ({
    id: LIKED_SONGS_METADATA.id,
    name: LIKED_SONGS_METADATA.name,
    description: LIKED_SONGS_METADATA.description,
    ownerName: LIKED_SONGS_METADATA.ownerName,
    image: LIKED_SONGS_METADATA.image,
    isPublic: LIKED_SONGS_METADATA.isPublic,
    tracksTotal: likedSongsTotal,
  }), [likedSongsTotal]);

  // Filter items by search term (case-insensitive, name and owner, words in any order)
  const filteredItems = useMemo(() => {
    const query = searchTerm.trim();
    
    // Filter regular playlists
    let filtered: Playlist[];
    if (!query) {
      filtered = items;
    } else {
      filtered = items.filter((playlist) => {
        const nameMatch = matchesAllWords(playlist.name, query);
        const ownerMatch = playlist.ownerName ? matchesAllWords(playlist.ownerName, query) : false;
        return nameMatch || ownerMatch;
      });
    }
    
    // Check if Liked Songs matches search (or show if no search)
    const likedMatches = !query || 
      matchesAllWords(likedSongsPlaylist.name, query) ||
      (likedSongsPlaylist.ownerName ? matchesAllWords(likedSongsPlaylist.ownerName, query) : false);
    
    // Prepend Liked Songs if it matches
    return likedMatches ? [likedSongsPlaylist, ...filtered] : filtered;
  }, [items, searchTerm, likedSongsPlaylist]);

  if (filteredItems.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {searchTerm ? "No playlists match your search" : "No playlists found"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isCompact ? (
        /* Compact mode: List view with 1-3 columns */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
          {filteredItems.map((playlist) => (
            <PlaylistListItem key={playlist.id} playlist={playlist} />
          ))}
        </div>
      ) : (
        /* Normal mode: Card grid */
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {filteredItems.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      )}

      {/* Auto-loading indicator */}
      {isAutoLoading && (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">
            Loading all playlists for instant search... ({items.length} loaded)
          </p>
        </div>
      )}
    </div>
  );
}
