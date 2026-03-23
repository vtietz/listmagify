"use client";

import Link from "next/link";
import React, { useState, useCallback } from "react";
import { Heart, Pencil, Play } from "lucide-react";
import type { Playlist  } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
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
  providerId: MusicProviderId;
  className?: string;
};

function canEditPlaylist(
  playlist: Playlist,
  userId: string | undefined,
  isLiked: boolean,
): boolean {
  return Boolean(!isLiked && userId && playlist.owner?.id === userId);
}

function playPlaylistIfPlayable(params: {
  isLiked: boolean;
  playlistId: string;
  play: (args: { contextUri: string }) => void;
}): void {
  if (params.isLiked) {
    return;
  }

  params.play({
    contextUri: `spotify:playlist:${params.playlistId}`,
  });
}

function buildPlaylistSubtitle(playlist: Playlist, isCompact: boolean): string {
  const tracksTotal = playlist.tracksTotal ?? 0;
  if (isCompact) {
    return `${tracksTotal} tracks`;
  }

  return `by ${playlist.ownerName ?? "Unknown"} • ${tracksTotal} tracks`;
}

function PlaylistArtwork({
  cover,
  playlistName,
  isLiked,
  isCompact,
}: {
  cover: string | undefined;
  playlistName: string;
  isLiked: boolean;
  isCompact: boolean;
}) {
  if (cover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={cover}
        alt={playlistName}
        className="w-full h-full object-contain bg-black/20 transition-transform group-hover:scale-[1.02]"
        loading="lazy"
      />
    );
  }

  if (isLiked) {
    return (
      <div className="w-full h-full grid place-items-center bg-gradient-to-br from-indigo-600 to-purple-500">
        <Heart className={cn("text-white fill-white", isCompact ? "w-8 h-8" : "w-16 h-16")} />
      </div>
    );
  }

  return (
    <div className="w-full h-full grid place-items-center text-sm text-muted-foreground">
      No cover
    </div>
  );
}

function PlaylistCardActions({
  isEditable,
  isPlayerVisible,
  isLiked,
  isCompact,
  playlistName,
  onEdit,
  onPlay,
}: {
  isEditable: boolean;
  isPlayerVisible: boolean;
  isLiked: boolean;
  isCompact: boolean;
  playlistName: string;
  onEdit: (e: React.MouseEvent) => void;
  onPlay: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {isEditable && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            isCompact ? "h-5 w-5" : "h-6 w-6"
          )}
          title="Edit playlist"
          aria-label={`Edit ${playlistName}`}
        >
          <Pencil className={cn(isCompact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        </Button>
      )}
      {isPlayerVisible && !isLiked && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onPlay}
          className={cn(
            "text-green-500 hover:text-green-400 hover:scale-110",
            isCompact ? "h-5 w-5" : "h-6 w-6"
          )}
          title={`Play ${playlistName}`}
          aria-label={`Play ${playlistName}`}
        >
          <Play className={cn(isCompact ? "h-3.5 w-3.5" : "h-4 w-4")} fill="currentColor" />
        </Button>
      )}
    </div>
  );
}

export function PlaylistCard({ playlist, providerId, className }: PlaylistCardProps) {
  const { isCompact } = useCompactModeStore();
  const { user } = useSessionUser();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const updatePlaylist = useUpdatePlaylist();
  const { play } = useSpotifyPlayer({ enableStatePolling: false });
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);
  
  const cover = playlist.image?.url;
  const isLiked = isLikedSongsPlaylist(playlist.id);
  const isEditable = canEditPlaylist(playlist, user?.id, isLiked);
  
  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditDialogOpen(true);
  }, []);

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    playPlaylistIfPlayable({
      isLiked,
      playlistId: playlist.id,
      play,
    });
  }, [isLiked, playlist.id, play]);

  const handleUpdatePlaylist = useCallback(async (values: { name: string; description: string; isPublic: boolean }) => {
    await updatePlaylist.mutateAsync({
      providerId,
      playlistId: playlist.id,
      name: values.name,
      description: values.description,
      isPublic: values.isPublic,
    });
  }, [updatePlaylist, providerId, playlist.id]);

  const canPlayFromCard = providerId === 'spotify';
  
  return (
    <>
      <Link
        href={`/playlists/${encodeURIComponent(playlist.id)}?provider=${providerId}`}
        className={cn(
          "group relative rounded-lg bg-card text-card-foreground overflow-hidden",
          "transition hover:shadow-md focus:outline-none focus:ring-2 ring-emerald-500",
          className
        )}
      >
        {/* Artwork container - per Spotify guidelines: no overlays, rounded corners (4px small, 8px large) */}
        <div className="aspect-square w-full bg-muted overflow-hidden rounded-t-lg">
          <PlaylistArtwork
            cover={cover}
            playlistName={playlist.name}
            isLiked={isLiked}
            isCompact={isCompact}
          />
        </div>
        {/* Controls moved outside artwork per Spotify guidelines - no overlays on artwork */}
        <div className={cn("space-y-0.5", isCompact ? "p-1.5" : "p-3 space-y-1")}>
          <div className="flex items-start justify-between gap-1">
            <div className={cn("font-medium line-clamp-1 flex-1 min-w-0", isCompact && "text-xs")}>{playlist.name}</div>
            <PlaylistCardActions
              isEditable={Boolean(isEditable)}
              isPlayerVisible={isPlayerVisible && canPlayFromCard}
              isLiked={isLiked}
              isCompact={isCompact}
              playlistName={playlist.name}
              onEdit={handleEditClick}
              onPlay={handlePlayClick}
            />
          </div>
          <div className={cn("text-muted-foreground line-clamp-1", isCompact ? "text-[10px]" : "text-xs")}>
            {buildPlaylistSubtitle(playlist, isCompact)}
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
            isPublic: playlist.isPublic ?? false,
          }}
          onSubmit={handleUpdatePlaylist}
          isSubmitting={updatePlaylist.isPending}
        />
      )}
    </>
  );
}