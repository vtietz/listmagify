"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Playlist } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { PlaylistCard } from "@/components/playlist/PlaylistCard";
import { PlaylistListItem } from "@/components/playlist/PlaylistListItem";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError, RateLimitApiError } from "@/lib/api/client";
import { useAutoLoadPaginated } from "@shared/hooks/useAutoLoadPaginated";
import { getLikedPlaylistMetadata } from "@features/playlists/hooks/useLikedVirtualPlaylist";
import { useLikedSongsTotal } from "@features/playlists/hooks/useSavedTracksIndex";
import { useCompactModeStore, useHydratedCompactMode } from "@features/split-editor/stores/useCompactModeStore";
import { matchesAllWords } from "@/lib/utils";
import { ProviderAuthError } from "@/lib/providers/errors";

export interface PlaylistsGridProps {
  providerId: MusicProviderId;
  initialItems: Playlist[];
  initialNextCursor: string | null;
  searchTerm: string;
  isRefreshing: boolean;
  onRefreshComplete: (items: Playlist[], nextCursor: string | null) => void;
  newlyCreatedPlaylist?: Playlist | null;
  onNewPlaylistAdded?: () => void;
  onLoadError?: (error: { kind: 'rate_limited'; message: string; retryAfterSeconds?: number }) => void;
}

function toRetryAfterSeconds(value: number | undefined): number | undefined {
  if (!value || value <= 0) {
    return undefined;
  }

  return Math.max(1, Math.ceil(value / 1000));
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
  providerId,
  initialItems,
  initialNextCursor,
  searchTerm,
  isRefreshing,
  onRefreshComplete,
  newlyCreatedPlaylist,
  onNewPlaylistAdded,
  onLoadError,
}: PlaylistsGridProps) {
  const clientCompact = useHydratedCompactMode();
  const hasHydrated = useCompactModeStore((s) => s._hasHydrated);
  // Real content is gated behind hasHydrated, so clientCompact is always reliable here
  const isCompact = clientCompact;
  const handledPlaylistIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef(false);
  
  // Auto-load all playlists for instant search
  const { items, isAutoLoading, setItems, setNextCursor } = useAutoLoadPaginated({
    initialItems,
    initialNextCursor,
    endpoint: `/api/me/playlists?provider=${providerId}`,
    itemsKey: "items",
  });

  // Get cached liked songs total (fetches on mount if not cached)
  const likedSongsTotal = useLikedSongsTotal(true, providerId);
  const likedPlaylistMetadata = useMemo(() => getLikedPlaylistMetadata(providerId), [providerId]);

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
        const data = await apiFetch<{ items: Playlist[]; nextCursor: string | null }>(`/api/me/playlists?provider=${providerId}`);
        if (cancelled) return;

        setItems(data.items || []);
        setNextCursor(data.nextCursor);
        onRefreshComplete(data.items || [], data.nextCursor);
      } catch (error) {
        if (cancelled) return;

        if (error instanceof ProviderAuthError && error.code === 'rate_limited') {
          onLoadError?.({
            kind: 'rate_limited',
            message: error.message,
            retryAfterSeconds: toRetryAfterSeconds(error.retryAfterMs),
          });
          onRefreshComplete(items, null);
          return;
        }

        if (error instanceof RateLimitApiError) {
          onLoadError?.({
            kind: 'rate_limited',
            message: error.message,
            retryAfterSeconds: toRetryAfterSeconds(error.retryAfterMs),
          });
          onRefreshComplete(items, null);
          return;
        }

        if (error instanceof ApiError && !error.isUnauthorized) {
          if (error.isRateLimited) {
            onLoadError?.({
              kind: 'rate_limited',
              message: error.message,
            });
          }

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
  }, [isRefreshing, items, setItems, setNextCursor, onRefreshComplete, providerId]);

  // Virtual playlist for Liked Songs (shown first)
  // Uses cached total from saved tracks index (populated when user visits split-editor)
  const likedSongsPlaylist: Playlist = useMemo(() => ({
    id: likedPlaylistMetadata.id,
    name: likedPlaylistMetadata.name,
    description: likedPlaylistMetadata.description,
    ownerName: likedPlaylistMetadata.ownerName,
    image: likedPlaylistMetadata.image,
    isPublic: likedPlaylistMetadata.isPublic,
    tracksTotal: likedSongsTotal,
  }), [likedSongsTotal, likedPlaylistMetadata]);

  const handlePlaylistDeleted = useCallback((playlistId: string) => {
    setItems((prev) => prev.filter((p) => p.id !== playlistId));
  }, [setItems]);

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

  // Wait for compact mode store to hydrate before rendering real content.
  // Until then, show a CSS-based skeleton that uses the `compact:` variant
  // so the blocking <script> in layout.tsx picks the right shape instantly.
  if (!hasHydrated) {
    return (
      <div className="space-y-6">
        {/* Compact skeleton — visible only when html.compact */}
        <div className="hidden compact:block">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="w-10 h-10 flex-shrink-0 rounded" />
                <div className="flex-1 min-w-0 space-y-1">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Normal skeleton — hidden when html.compact */}
        <div className="block compact:hidden">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square rounded-t-lg" />
                <div className="space-y-1 px-3 pb-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

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
            <PlaylistListItem key={playlist.id} playlist={playlist} providerId={providerId} onDeleted={handlePlaylistDeleted} />
          ))}
        </div>
      ) : (
        /* Normal mode: Card grid */
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {filteredItems.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} providerId={providerId} onDeleted={handlePlaylistDeleted} />
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
