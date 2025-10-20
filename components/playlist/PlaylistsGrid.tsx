"use client";

import { useEffect, useMemo } from "react";
import type { Playlist } from "@/lib/spotify/types";
import { PlaylistCard } from "@/components/playlist/PlaylistCard";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useAutoLoadPaginated } from "@/hooks/useAutoLoadPaginated";

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

  // Filter items by search term (case-insensitive, name and owner)
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return items;
    }

    const query = searchTerm.toLowerCase();
    return items.filter((playlist) => {
      const nameMatch = playlist.name.toLowerCase().includes(query);
      const ownerMatch = playlist.ownerName?.toLowerCase().includes(query) ?? false;
      return nameMatch || ownerMatch;
    });
  }, [items, searchTerm]);

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
