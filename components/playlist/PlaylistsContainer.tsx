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

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
  }, []);

  const handleRefreshComplete = useCallback(() => {
    setIsRefreshing(false);
  }, []);

  return (
    <div className="space-y-6">
      <PlaylistsToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      <PlaylistsGrid
        initialItems={initialItems}
        initialNextCursor={initialNextCursor}
        searchTerm={searchTerm}
        isRefreshing={isRefreshing}
        onRefreshComplete={handleRefreshComplete}
      />
    </div>
  );
}
