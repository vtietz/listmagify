"use client";

import Link from "next/link";
import React, { useState, useCallback } from "react";
import { Heart, Pencil, Play } from "lucide-react";
import { type Playlist } from "@/lib/spotify/types";
import { cn } from "@/lib/utils";
import { isLikedSongsPlaylist } from "@/hooks/useLikedVirtualPlaylist";
import { useCompactModeStore } from "@/hooks/useCompactModeStore";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { usePlayerStore } from "@/hooks/usePlayerStore";
import { Button } from "@/components/ui/button";
import { PlaylistDialog } from "@/components/playlist/PlaylistDialog";
import { useUpdatePlaylist } from "@/lib/spotify/playlistMutations";

type PlaylistCardProps = {
  playlist: Playlist;
  className?: string;
};

export function PlaylistCard({ playlist, className }: PlaylistCardProps) {
  const { isCompact } = useCompactModeStore();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const updatePlaylist = useUpdatePlaylist();
  const { play } = useSpotifyPlayer();
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);
  
  const cover = playlist.image?.url;
  const isLiked = isLikedSongsPlaylist(playlist.id);
  
  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditDialogOpen(true);
  }, []);

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // For Liked Songs, we can't use a context URI - would need to load all tracks
    // For now, just navigate to the playlist (playing is handled there)
    if (isLiked) return;
    
    // Play the playlist using context URI
    play({
      contextUri: `spotify:playlist:${playlist.id}`,
    });
  }, [isLiked, playlist.id, play]);

  const handleUpdatePlaylist = useCallback(async (values: { name: string; description: string }) => {
    await updatePlaylist.mutateAsync({
      playlistId: playlist.id,
      name: values.name,
      description: values.description,
    });
  }, [updatePlaylist, playlist.id]);
  
  return (
    <>
      <Link
        href={`/playlists/${encodeURIComponent(playlist.id)}`}
        className={cn(
          "group relative rounded-lg bg-card text-card-foreground overflow-hidden",
          "transition hover:shadow-md focus:outline-none focus:ring-2 ring-emerald-500",
          className
        )}
      >
        <div className="aspect-square w-full bg-muted overflow-hidden relative">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={playlist.name}
              className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : isLiked ? (
            <div className="w-full h-full grid place-items-center bg-gradient-to-br from-indigo-600 to-purple-500">
              <Heart className={cn("text-white fill-white", isCompact ? "w-8 h-8" : "w-16 h-16")} />
            </div>
          ) : (
            <div className="w-full h-full grid place-items-center text-sm text-muted-foreground">
              No cover
            </div>
          )}
          
          {/* Edit button - only show for non-Liked Songs playlists */}
          {!isLiked && (
            <Button
              variant="secondary"
              size="icon"
              onClick={handleEditClick}
              className={cn(
                "absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity",
                "bg-black/60 hover:bg-black/80 text-white",
                isCompact ? "h-6 w-6" : "h-8 w-8"
              )}
              title="Edit playlist"
              aria-label={`Edit ${playlist.name}`}
            >
              <Pencil className={cn(isCompact ? "h-3 w-3" : "h-4 w-4")} />
            </Button>
          )}
          
          {/* Play button - show when player is visible, works for all playlists except Liked Songs */}
          {isPlayerVisible && !isLiked && (
            <Button
              variant="secondary"
              size="icon"
              onClick={handlePlayClick}
              className={cn(
                "absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-all",
                "bg-green-500 hover:bg-green-400 hover:scale-110 text-white shadow-lg",
                isCompact ? "h-8 w-8" : "h-10 w-10"
              )}
              title={`Play ${playlist.name}`}
              aria-label={`Play ${playlist.name}`}
            >
              <Play className={cn(isCompact ? "h-4 w-4 ml-0.5" : "h-5 w-5 ml-0.5")} fill="currentColor" />
            </Button>
          )}
        </div>
        <div className={cn("space-y-0.5", isCompact ? "p-1.5" : "p-3 space-y-1")}>
          <div className={cn("font-medium line-clamp-1", isCompact && "text-xs")}>{playlist.name}</div>
          <div className={cn("text-muted-foreground line-clamp-1", isCompact ? "text-[10px]" : "text-xs")}>
            {isCompact ? playlist.tracksTotal ?? 0 : `by ${playlist.ownerName ?? "Unknown"} • ${playlist.tracksTotal ?? 0}`} tracks
          </div>
        </div>
      </Link>

      {/* Edit dialog - only rendered for non-Liked Songs playlists */}
      {!isLiked && (
        <PlaylistDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          mode="edit"
          initialValues={{
            name: playlist.name,
            description: playlist.description ?? "",
          }}
          onSubmit={handleUpdatePlaylist}
          isSubmitting={updatePlaylist.isPending}
        />
      )}
    </>
  );
}