"use client";

import { useEffect, useMemo } from "react";
import type { Playlist } from "@/lib/spotify/types";
import { PlaylistCard } from "@/components/playlist/PlaylistCard";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useAutoLoadPaginated } from "@/hooks/useAutoLoadPaginated";
import { LIKED_SONGS_METADATA } from "@/hooks/useLikedVirtualPlaylist";
import { useLikedSongsTotal } from "@/hooks/useSavedTracksIndex";

export interface PlaylistsGridProps {
  initialItems: Playlist[];
  initialNextCursor: string | null;
  searchTerm: string;
  isRefreshing: boolean;
  onRefreshComplete: (items: Playlist[], nextCursor: string | null) => void;
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
}: PlaylistsGridProps) {
  // Auto-load all playlists for instant search
  const { items, isAutoLoading, setItems, setNextCursor } = useAutoLoadPaginated({
    initialItems,
    initialNextCursor,
    endpoint: "/api/me/playlists",
    itemsKey: "items",
  });

  // Get cached liked songs total (fetches on mount if not cached)
  const likedSongsTotal = useLikedSongsTotal();

  // Handle refresh from parent
  useEffect(() => {
    if (isRefreshing) {
      // Reset state and fetch from beginning
      const fetchInitial = async () => {
        try {
          const data = await apiFetch<{ items: Playlist[]; nextCursor: string | null }>("/api/me/playlists");

          setItems(data.items || []);
          setNextCursor(data.nextCursor);
          onRefreshComplete(data.items || [], data.nextCursor);
        } catch (error) {
          // apiFetch handles 401 automatically, just handle other errors
          if (error instanceof ApiError && !error.isUnauthorized) {
            // Keep existing data on error
            onRefreshComplete(items, null);
          }
        }
      };

      fetchInitial();
    }
  }, [isRefreshing]); // Intentionally limited deps

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

  // Filter items by search term (case-insensitive, name and owner)
  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    
    // Filter regular playlists
    let filtered: Playlist[];
    if (!query) {
      filtered = items;
    } else {
      filtered = items.filter((playlist) => {
        const nameMatch = playlist.name.toLowerCase().includes(query);
        const ownerMatch = playlist.ownerName?.toLowerCase().includes(query) ?? false;
        return nameMatch || ownerMatch;
      });
    }
    
    // Check if Liked Songs matches search (or show if no search)
    const likedMatches = !query || 
      likedSongsPlaylist.name.toLowerCase().includes(query) ||
      likedSongsPlaylist.ownerName?.toLowerCase().includes(query);
    
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {filteredItems.map((playlist) => (
          <PlaylistCard key={playlist.id} playlist={playlist} />
        ))}
      </div>

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
