"use client";

import Link from "next/link";
import React, { useState, useCallback } from "react";
import { Heart, Pencil, Play, Trash2 } from "lucide-react";
import type { Playlist  } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { cn } from "@/lib/utils";
import { isLikedSongsPlaylist } from "@features/playlists/hooks/useLikedVirtualPlaylist";
import { useCompactModeStore } from "@features/split-editor/stores/useCompactModeStore";
import { useSessionUser } from "@features/auth/hooks/useSessionUser";
import { useProviderUserId } from "@shared/hooks/useProviderUserId";
import { useSpotifyPlayer } from "@features/player/hooks/useSpotifyPlayer";
import { usePlayerStore } from "@features/player/hooks/usePlayerStore";
import { Button } from "@/components/ui/button";
import { PlaylistDialog } from "@/components/playlist/PlaylistDialog";
import { DeletePlaylistDialog } from "@/components/playlist/DeletePlaylistDialog";
import { useUpdatePlaylist, useDeletePlaylist } from "@/lib/spotify/playlistMutations";
import { ArtworkImage } from "@shared/ui/ArtworkImage";

type PlaylistCardProps = {
  playlist: Playlist;
  providerId: MusicProviderId;
  className?: string;
  onDeleted?: (playlistId: string) => void;
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
      // Parent container must have position:relative for fill to work
      <ArtworkImage
        src={cover}
        alt={playlistName}
        fill
        className="object-contain bg-black/20 transition-transform group-hover:scale-[1.02]"
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
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
  isDeletable,
  isPlayerVisible,
  isLiked,
  isCompact,
  playlistName,
  onEdit,
  onPlay,
  onDelete,
}: {
  isEditable: boolean;
  isDeletable: boolean;
  isPlayerVisible: boolean;
  isLiked: boolean;
  isCompact: boolean;
  playlistName: string;
  onEdit: (e: React.MouseEvent) => void;
  onPlay: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
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
      {isDeletable && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className={cn(
            "text-muted-foreground hover:text-destructive",
            isCompact ? "h-5 w-5" : "h-6 w-6"
          )}
          title="Delete playlist"
          aria-label={`Delete ${playlistName}`}
        >
          <Trash2 className={cn(isCompact ? "h-3 w-3" : "h-3.5 w-3.5")} />
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

export function PlaylistCard({ playlist, providerId, className, onDeleted }: PlaylistCardProps) {
  const { isCompact } = useCompactModeStore();
  const { user } = useSessionUser();
  const providerUserId = useProviderUserId(providerId);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const updatePlaylist = useUpdatePlaylist();
  const deletePlaylist = useDeletePlaylist();
  const { play } = useSpotifyPlayer({ enableStatePolling: false });
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);

  const cover = playlist.image?.url;
  const isLiked = isLikedSongsPlaylist(playlist.id);
  const isEditable = canEditPlaylist(playlist, providerUserId, isLiked);
  const isDeletable = Boolean(!isLiked && user?.id && providerId === 'tidal');

  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    await deletePlaylist.mutateAsync({ providerId, playlistId: playlist.id });
    setDeleteDialogOpen(false);
    onDeleted?.(playlist.id);
  }, [deletePlaylist, providerId, playlist.id, onDeleted]);

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
        <div className="relative aspect-square w-full bg-muted overflow-hidden rounded-t-lg">
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
              isDeletable={isDeletable}
              isPlayerVisible={isPlayerVisible && canPlayFromCard}
              isLiked={isLiked}
              isCompact={isCompact}
              playlistName={playlist.name}
              onEdit={handleEditClick}
              onPlay={handlePlayClick}
              onDelete={handleDeleteClick}
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

      {/* Delete confirmation dialog — always mounted, controlled by `open` */}
      <DeletePlaylistDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        playlistName={playlist.name}
        playlistId={playlist.id}
        providerId={providerId}
        onConfirm={handleDeleteConfirm}
        isDeleting={deletePlaylist.isPending}
      />
    </>
  );
}