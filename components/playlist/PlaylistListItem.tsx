"use client";

import Link from "next/link";
import React, { useState, useCallback } from "react";
import { Heart, Pencil, Play } from "lucide-react";
import { type Playlist } from "@/lib/spotify/types";
import { cn } from "@/lib/utils";
import { isLikedSongsPlaylist } from "@/hooks/useLikedVirtualPlaylist";
import { useSessionUser } from "@/hooks/useSessionUser";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { usePlayerStore } from "@/hooks/usePlayerStore";
import { Button } from "@/components/ui/button";
import { PlaylistDialog } from "@/components/playlist/PlaylistDialog";
import { useUpdatePlaylist } from "@/lib/spotify/playlistMutations";

type PlaylistListItemProps = {
  playlist: Playlist;
  className?: string;
};

/**
 * Compact list item view for playlists.
 * Shows playlist cover, name, and track count in a horizontal row.
 */
export function PlaylistListItem({ playlist, className }: PlaylistListItemProps) {
  const { user } = useSessionUser();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const updatePlaylist = useUpdatePlaylist();
  const { play } = useSpotifyPlayer();
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);
  
  const cover = playlist.image?.url;
  const isLiked = isLikedSongsPlaylist(playlist.id);
  // Only allow editing if user owns the playlist (not Liked Songs, not imported)
  const isEditable = !isLiked && user?.id && playlist.owner?.id === user.id;
  
  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditDialogOpen(true);
  }, []);

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isLiked) return;
    
    play({
      contextUri: `spotify:playlist:${playlist.id}`,
    });
  }, [isLiked, playlist.id, play]);

  const handleUpdatePlaylist = useCallback(async (values: { name: string; description: string; isPublic: boolean }) => {
    await updatePlaylist.mutateAsync({
      playlistId: playlist.id,
      name: values.name,
      description: values.description,
      isPublic: values.isPublic,
    });
  }, [updatePlaylist, playlist.id]);
  
  return (
    <>
      <Link
        href={`/playlists/${encodeURIComponent(playlist.id)}`}
        className={cn(
          "group flex items-center gap-3 p-2 rounded-md",
          "hover:bg-muted/50 transition-colors",
          "focus:outline-none focus:ring-2 ring-emerald-500",
          className
        )}
      >
        {/* Small cover image */}
        <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-muted">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={playlist.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : isLiked ? (
            <div className="w-full h-full grid place-items-center bg-gradient-to-br from-indigo-600 to-purple-500">
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
          ) : (
            <div className="w-full h-full grid place-items-center text-muted-foreground">
              <span className="text-[8px]">No cover</span>
            </div>
          )}
        </div>
        
        {/* Playlist info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{playlist.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {playlist.tracksTotal ?? 0} tracks
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {isEditable && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleEditClick}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Edit playlist"
              aria-label={`Edit ${playlist.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {isPlayerVisible && !isLiked && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePlayClick}
              className="h-7 w-7 text-green-500 hover:text-green-400"
              title={`Play ${playlist.name}`}
              aria-label={`Play ${playlist.name}`}
            >
              <Play className="h-4 w-4" fill="currentColor" />
            </Button>
          )}
        </div>
      </Link>

      {/* Edit dialog */}
      {isEditable && (
        <PlaylistDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          mode="edit"
          initialValues={{
            name: playlist.name,
            description: playlist.description ?? "",
            isPublic: playlist.isPublic ?? false,
          }}
          onSubmit={handleUpdatePlaylist}
          isSubmitting={updatePlaylist.isPending}
        />
      )}
    </>
  );
}
