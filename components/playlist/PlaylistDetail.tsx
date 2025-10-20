"use client";

import { useState, useMemo, useCallback } from "react";
import type { Track, Playlist } from "@/lib/spotify/types";
import { PlaylistToolbar } from "@/components/playlist/PlaylistToolbar";
import { PlaylistTable, type SortKey, type SortDirection } from "@/components/playlist/PlaylistTable";
import { apiFetch } from "@/lib/api/client";
import { useAutoLoadPaginated } from "@/hooks/useAutoLoadPaginated";
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from "sonner";

export interface PlaylistDetailProps {
  playlist: Playlist;
  initialTracks: Track[];
  initialSnapshotId?: string | null;
  initialNextCursor?: string | null;
}

/**
 * Main interactive playlist component with search, sort, reorder, and refresh.
 * 
 * Features:
 * - Auto-loads all tracks on mount for instant search
 * - Client-side search (debounced) by title, artist, album
 * - Sortable columns with stable asc/desc sort
 * - Drag-and-drop reordering (position sort only)
 * - Optimistic updates with rollback on error
 * - Refresh from Spotify with snapshot_id tracking
 * - Multi-instance ready (all state is local)
 */
export function PlaylistDetail({
  playlist,
  initialTracks,
  initialSnapshotId,
  initialNextCursor,
}: PlaylistDetailProps) {
  const [snapshotId, setSnapshotId] = useState<string | null>(initialSnapshotId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [isReordering, setIsReordering] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-load all tracks for instant search
  const { items: tracks, isAutoLoading, setItems: setTracks, setNextCursor } = useAutoLoadPaginated({
    initialItems: initialTracks,
    initialNextCursor,
    endpoint: `/api/playlists/${playlist.id}/tracks`,
    itemsKey: "tracks",
  });

  /**
   * Filter tracks by search query (title, artist, album - case insensitive).
   */
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) {
      return tracks;
    }

    const query = searchQuery.toLowerCase();
    return tracks.filter((track) => {
      const titleMatch = track.name.toLowerCase().includes(query);
      const artistMatch = track.artists.some((artist) =>
        artist.toLowerCase().includes(query)
      );
      const albumMatch = track.album?.name?.toLowerCase().includes(query) ?? false;

      return titleMatch || artistMatch || albumMatch;
    });
  }, [tracks, searchQuery]);

  /**
   * Sort filtered tracks by the selected key and direction.
   */
  const sortedTracks = useMemo(() => {
    const sorted = [...filteredTracks];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case "position":
          // Position sort uses the original array order
          comparison = tracks.indexOf(a) - tracks.indexOf(b);
          break;
        case "title":
          comparison = a.name.localeCompare(b.name);
          break;
        case "artist":
          comparison = (a.artists[0] || "").localeCompare(b.artists[0] || "");
          break;
        case "album":
          comparison = (a.album?.name || "").localeCompare(b.album?.name || "");
          break;
        case "duration":
          comparison = a.durationMs - b.durationMs;
          break;
        case "addedAt":
          comparison = (a.addedAt || "").localeCompare(b.addedAt || "");
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [filteredTracks, sortKey, sortDirection, tracks]);

  /**
   * Handle sort column change (toggle direction if same key).
   */
  const handleSortChange = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"));
        return prev;
      } else {
        setSortDirection("asc");
        return key;
      }
    });
  }, []);

  /**
   * Handle drag-and-drop reorder (only when sortKey === "position").
   */
  const handleReorder = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || isReordering) {
        return;
      }

      // Save previous state for rollback
      const previousTracks = tracks;
      const previousSnapshotId = snapshotId;

      // Optimistic update
      const newTracks = [...tracks];
      const [moved] = newTracks.splice(fromIndex, 1);
      if (!moved) return; // Guard against invalid indices
      newTracks.splice(toIndex, 0, moved);
      setTracks(newTracks);
      setIsReordering(true);

      try {
        const data = await apiFetch<{ snapshotId?: string }>(`/api/playlists/${playlist.id}/reorder`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromIndex,
            toIndex,
            rangeLength: 1,
            snapshotId,
          }),
        });

        // Success - update snapshot_id
        if (data.snapshotId) {
          setSnapshotId(data.snapshotId);
        }

        toast.success("Track reordered successfully");
      } catch (error) {
        // Rollback on error (apiFetch handles 401 automatically)
        setTracks(previousTracks);
        setSnapshotId(previousSnapshotId);
        toast.error(
          error instanceof Error ? error.message : "Failed to reorder track"
        );
      } finally {
        setIsReordering(false);
      }
    },
    [tracks, snapshotId, isReordering, playlist.id]
  );

  /**
   * Refresh tracks from Spotify (resets to first page).
   */
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      const data = await apiFetch<{ tracks: Track[]; snapshotId?: string; nextCursor?: string | null }>(
        `/api/playlists/${playlist.id}/tracks`
      );

      setTracks(data.tracks || []);
      if (data.snapshotId) {
        setSnapshotId(data.snapshotId);
      }
      setNextCursor(data.nextCursor ?? null);

      toast.success("Playlist refreshed");
    } catch (error) {
      // apiFetch handles 401 automatically
      toast.error(
        error instanceof Error ? error.message : "Failed to refresh playlist"
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, playlist.id, setTracks, setNextCursor]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold mb-1">{playlist.name}</h1>
        {playlist.description && (
          <p className="text-sm text-muted-foreground">{playlist.description}</p>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
          {searchQuery && filteredTracks.length !== tracks.length && (
            <span> • {filteredTracks.length} visible</span>
          )}
        </p>
      </header>

      {/* Toolbar */}
      <PlaylistToolbar
        onSearchChange={setSearchQuery}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        disabled={isReordering}
      />

      {/* Table */}
      <PlaylistTable
        tracks={sortedTracks}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
        onReorder={handleReorder}
        isReordering={isReordering}
        disabled={isRefreshing}
      />

      {/* Auto-load progress indicator */}
      {isAutoLoading && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Loading all tracks for instant search... ({tracks.length} loaded)
          </p>
        </div>
      )}
    </div>
  );
}
