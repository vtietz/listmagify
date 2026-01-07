"use client";

import Link from "next/link";
import React, { useState, useCallback } from "react";
import { Heart, Pencil, Play } from "lucide-react";
import { type Playlist } from "@/lib/spotify/types";
import { cn } from "@/lib/utils";
import { isLikedSongsPlaylist } from "@/hooks/useLikedVirtualPlaylist";
import { useCompactModeStore } from "@/hooks/useCompactModeStore";
import { useSessionUser } from "@/hooks/useSessionUser";
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
        {/* Artwork container - per Spotify guidelines: no overlays, rounded corners (4px small, 8px large) */}
        <div className="aspect-square w-full bg-muted overflow-hidden rounded-t-lg">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={playlist.name}
              // Use object-contain to avoid cropping artwork per Spotify guidelines
              className="w-full h-full object-contain bg-black/20 transition-transform group-hover:scale-[1.02]"
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
        </div>
        {/* Controls moved outside artwork per Spotify guidelines - no overlays on artwork */}
        <div className={cn("space-y-0.5", isCompact ? "p-1.5" : "p-3 space-y-1")}>
          <div className="flex items-start justify-between gap-1">
            <div className={cn("font-medium line-clamp-1 flex-1 min-w-0", isCompact && "text-xs")}>{playlist.name}</div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Edit button - only show for playlists owned by current user */}
              {isEditable && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleEditClick}
                  className={cn(
                    "text-muted-foreground hover:text-foreground",
                    isCompact ? "h-5 w-5" : "h-6 w-6"
                  )}
                  title="Edit playlist"
                  aria-label={`Edit ${playlist.name}`}
                >
                  <Pencil className={cn(isCompact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                </Button>
              )}
              {/* Play button - show when player is visible, works for all playlists except Liked Songs */}
              {isPlayerVisible && !isLiked && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePlayClick}
                  className={cn(
                    "text-green-500 hover:text-green-400 hover:scale-110",
                    isCompact ? "h-5 w-5" : "h-6 w-6"
                  )}
                  title={`Play ${playlist.name}`}
                  aria-label={`Play ${playlist.name}`}
                >
                  <Play className={cn(isCompact ? "h-3.5 w-3.5" : "h-4 w-4")} fill="currentColor" />
                </Button>
              )}
            </div>
          </div>
          <div className={cn("text-muted-foreground line-clamp-1", isCompact ? "text-[10px]" : "text-xs")}>
            {isCompact ? playlist.tracksTotal ?? 0 : `by ${playlist.ownerName ?? "Unknown"} • ${playlist.tracksTotal ?? 0}`} tracks
          </div>
        </div>
      </Link>

      {/* Edit dialog - only rendered for playlists owned by current user */}
      {isEditable && (
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