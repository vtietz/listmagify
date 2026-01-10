"use client";

import { AdaptiveSearch } from "@/components/ui/adaptive-search";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { PlaylistDialog } from "@/components/playlist/PlaylistDialog";
import { useCreatePlaylist } from "@/lib/spotify/playlistMutations";
import type { Playlist } from "@/lib/spotify/types";

export interface PlaylistsToolbarProps {
  searchTerm: string;
  onSearchChange: (query: string) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  onPlaylistCreated?: (playlist: Playlist) => void;
}

/**
 * Toolbar for playlists index with debounced search, refresh, and create playlist button.
 * 
 * Features:
 * - Debounced search input (300ms delay)
 * - Refresh button with loading state
 * - Create new playlist button with dialog
 * - Keyboard accessible controls
 */
export function PlaylistsToolbar({
  searchTerm,
  onSearchChange,
  isRefreshing,
  onRefresh,
  onPlaylistCreated,
}: PlaylistsToolbarProps) {
  const [inputValue, setInputValue] = useState(searchTerm);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  const createPlaylist = useCreatePlaylist();

  // Sync with external searchTerm changes
  useEffect(() => {
    setInputValue(searchTerm);
  }, [searchTerm]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, onSearchChange]);

  const handleRefresh = useCallback(() => {
    if (!isRefreshing) {
      onRefresh();
    }
  }, [onRefresh, isRefreshing]);

  const handleCreatePlaylist = useCallback(async (values: { name: string; description: string }) => {
    const result = await createPlaylist.mutateAsync({
      name: values.name,
      description: values.description,
    });
    // Immediately add the new playlist to the list for instant feedback
    if (onPlaylistCreated) {
      onPlaylistCreated({
        id: result.id,
        name: result.name,
        description: result.description,
        isPublic: result.isPublic,
        ownerName: result.ownerName,
        image: result.image,
        tracksTotal: result.tracksTotal,
      });
    }
  }, [createPlaylist, onPlaylistCreated]);

  return (
    <div className="flex items-center gap-3">
      <AdaptiveSearch
        value={inputValue}
        onChange={setInputValue}
        placeholder="Search playlists..."
        disabled={isRefreshing}
        ariaLabel="Search playlists"
        breakpoint={200}
      />

      <Button
        variant="default"
        size="sm"
        onClick={() => setCreateDialogOpen(true)}
        disabled={isRefreshing}
        title="Create new playlist"
        aria-label="Create new playlist"
        className="shrink-0"
      >
        <Plus className="h-4 w-4 mr-1" />
        New Playlist
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={handleRefresh}
        disabled={isRefreshing}
        title={isRefreshing ? "Refreshing..." : "Refresh playlists from Spotify"}
        aria-label={isRefreshing ? "Refreshing playlists" : "Refresh playlists"}
        className="shrink-0"
      >
        <RefreshCw
          className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
      </Button>

      <PlaylistDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        mode="create"
        onSubmit={handleCreatePlaylist}
        isSubmitting={createPlaylist.isPending}
      />
    </div>
  );
}
