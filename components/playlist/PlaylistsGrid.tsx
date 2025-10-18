"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Playlist } from "@/lib/spotify/types";
import { PlaylistCard } from "@/components/playlist/PlaylistCard";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api/client";

export interface PlaylistsGridProps {
  initialItems: Playlist[];
  initialNextCursor: string | null;
  searchTerm: string;
  isRefreshing: boolean;
  onRefreshComplete: (items: Playlist[], nextCursor: string | null) => void;
}

/**
 * Infinite scroll grid for playlists with client-side filtering.
 * 
 * Features:
 * - IntersectionObserver-based infinite scroll
 * - Client-side search filtering by name and owner
 * - Automatic loading of additional pages
 * - Loading states and error handling
 */
export function PlaylistsGrid({
  initialItems,
  initialNextCursor,
  searchTerm,
  isRefreshing,
  onRefreshComplete,
}: PlaylistsGridProps) {
  const [items, setItems] = useState<Playlist[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

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
            onRefreshComplete(items, nextCursor);
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

  // Load more items when sentinel becomes visible
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !nextCursor || isRefreshing) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const data = await apiFetch<{ items: Playlist[]; nextCursor: string | null }>(
        `/api/me/playlists?${new URLSearchParams({ nextCursor }).toString()}`
      );

      setItems((prev) => [...prev, ...(data.items || [])]);
      setNextCursor(data.nextCursor);
    } catch (error) {
      // apiFetch handles 401 automatically, just silently fail for other errors
      // (user already saw error toast from apiFetch if not 401)
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor, isRefreshing]);

  // Set up IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          loadMore();
        }
      },
      {
        root: null,
        rootMargin: "100px",
        threshold: 0.1,
      }
    );

    observerRef.current.observe(sentinelRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loadMore]);

  if (filteredItems.length === 0 && !isLoadingMore) {
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

      {/* Sentinel for infinite scroll */}
      {nextCursor && !searchTerm && (
        <div ref={sentinelRef} className="py-8">
          {isLoadingMore && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-square rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
