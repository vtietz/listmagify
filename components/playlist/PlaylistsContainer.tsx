"use client";

import { useState, useCallback } from "react";
import type { Playlist } from "@/lib/spotify/types";
import { PlaylistsToolbar } from "@/components/playlist/PlaylistsToolbar";
import { PlaylistsGrid } from "@/components/playlist/PlaylistsGrid";

export interface PlaylistsContainerProps {
  initialItems: Playlist[];
  initialNextCursor: string | null;
}

/**
 * Container component managing state for playlists index.
 * Coordinates between toolbar (search/refresh) and grid (display/infinite scroll).
 */
export function PlaylistsContainer({
  initialItems,
  initialNextCursor,
}: PlaylistsContainerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newlyCreatedPlaylist, setNewlyCreatedPlaylist] = useState<Playlist | null>(null);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
  }, []);

  const handleRefreshComplete = useCallback(() => {
    setIsRefreshing(false);
  }, []);

  // Called when a new playlist is created - store it for immediate display
  const handlePlaylistCreated = useCallback((playlist: Playlist) => {
    setNewlyCreatedPlaylist(playlist);
  }, []);

  // Called when grid has incorporated the new playlist
  const handleNewPlaylistAdded = useCallback(() => {
    setNewlyCreatedPlaylist(null);
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6 mt-6">
      <div className="flex-shrink-0">
        <PlaylistsToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          onPlaylistCreated={handlePlaylistCreated}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <PlaylistsGrid
          initialItems={initialItems}
          initialNextCursor={initialNextCursor}
          searchTerm={searchTerm}
          isRefreshing={isRefreshing}
          onRefreshComplete={handleRefreshComplete}
          newlyCreatedPlaylist={newlyCreatedPlaylist}
          onNewPlaylistAdded={handleNewPlaylistAdded}
        />
      </div>
    </div>
  );
}
