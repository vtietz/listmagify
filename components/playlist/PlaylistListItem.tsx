"use client";

import Link from "next/link";
import React, { useState, useCallback } from "react";
import { Heart, Pencil, Play } from "lucide-react";
import type { Playlist  } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
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

function PlaylistListCover({
  cover,
  playlistName,
  isLiked,
}: {
  cover: string | undefined;
  playlistName: string;
  isLiked: boolean;
}) {
  if (cover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={cover}
        alt={playlistName}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    );
  }

  if (isLiked) {
    return (
      <div className="w-full h-full grid place-items-center bg-gradient-to-br from-indigo-600 to-purple-500">
        <Heart className="w-5 h-5 text-white fill-white" />
      </div>
    );
  }

  return (
    <div className="w-full h-full grid place-items-center text-muted-foreground">
      <span className="text-[8px]">No cover</span>
    </div>
  );
}

function PlaylistListActions({
  isEditable,
  isPlayerVisible,
  isLiked,
  playlistName,
  onEdit,
  onPlay,
}: {
  isEditable: boolean;
  isPlayerVisible: boolean;
  isLiked: boolean;
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
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="Edit playlist"
          aria-label={`Edit ${playlistName}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
      {isPlayerVisible && !isLiked && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onPlay}
          className="h-7 w-7 text-green-500 hover:text-green-400"
          title={`Play ${playlistName}`}
          aria-label={`Play ${playlistName}`}
        >
          <Play className="h-4 w-4" fill="currentColor" />
        </Button>
      )}
    </div>
  );
}

/**
 * Compact list item view for playlists.
 * Shows playlist cover, name, and track count in a horizontal row.
 */
export function PlaylistListItem({ playlist, providerId, className }: PlaylistListItemProps) {
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

  const canPlayFromListItem = providerId === 'spotify';
  
  return (
    <>
      <Link
        href={`/playlists/${encodeURIComponent(playlist.id)}?provider=${providerId}`}
        className={cn(
          "group flex items-center gap-3 p-2 rounded-md",
          "hover:bg-muted/50 transition-colors",
          "focus:outline-none focus:ring-2 ring-emerald-500",
          className
        )}
      >
        {/* Small cover image */}
        <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-muted">
          <PlaylistListCover cover={cover} playlistName={playlist.name} isLiked={isLiked} />
        </div>
        
        {/* Playlist info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{playlist.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {playlist.tracksTotal ?? 0} tracks
          </div>
        </div>

        {/* Action buttons */}
        <PlaylistListActions
          isEditable={Boolean(isEditable)}
          isPlayerVisible={isPlayerVisible && canPlayFromListItem}
          isLiked={isLiked}
          playlistName={playlist.name}
          onEdit={handleEditClick}
          onPlay={handlePlayClick}
        />
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
