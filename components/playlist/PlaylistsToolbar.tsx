"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, Search, Plus } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { PlaylistDialog } from "@/components/playlist/PlaylistDialog";
import { useCreatePlaylist } from "@/lib/spotify/playlistMutations";

export interface PlaylistsToolbarProps {
  searchTerm: string;
  onSearchChange: (query: string) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
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

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  const handleRefresh = useCallback(() => {
    if (!isRefreshing) {
      onRefresh();
    }
  }, [onRefresh, isRefreshing]);

  const handleCreatePlaylist = useCallback(async (values: { name: string; description: string }) => {
    await createPlaylist.mutateAsync({
      name: values.name,
      description: values.description,
    });
    // Trigger a refresh to show the new playlist
    onRefresh();
  }, [createPlaylist, onRefresh]);

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search playlists..."
          value={inputValue}
          onChange={handleInputChange}
          disabled={isRefreshing}
          className="pl-9"
          aria-label="Search playlists"
        />
      </div>

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
