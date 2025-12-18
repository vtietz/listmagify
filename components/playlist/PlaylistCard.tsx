"use client";

import Link from "next/link";
import React from "react";
import { Heart } from "lucide-react";
import { type Playlist } from "@/lib/spotify/types";
import { cn } from "@/lib/utils";
import { isLikedSongsPlaylist } from "@/hooks/useLikedVirtualPlaylist";
import { useCompactModeStore } from "@/hooks/useCompactModeStore";

type PlaylistCardProps = {
  playlist: Playlist;
  className?: string;
};

export function PlaylistCard({ playlist, className }: PlaylistCardProps) {
  const { isCompact } = useCompactModeStore();
  const cover = playlist.image?.url;
  const isLiked = isLikedSongsPlaylist(playlist.id);
  
  return (
    <Link
      href={`/playlists/${encodeURIComponent(playlist.id)}`}
      className={cn(
        "group rounded-lg bg-card text-card-foreground overflow-hidden",
        "transition hover:shadow-md focus:outline-none focus:ring-2 ring-emerald-500",
        className
      )}
    >
      <div className="aspect-square w-full bg-muted overflow-hidden">
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
      </div>
      <div className={cn("space-y-0.5", isCompact ? "p-1.5" : "p-3 space-y-1")}>
        <div className={cn("font-medium line-clamp-1", isCompact && "text-xs")}>{playlist.name}</div>
        <div className={cn("text-muted-foreground line-clamp-1", isCompact ? "text-[10px]" : "text-xs")}>
          {isCompact ? playlist.tracksTotal ?? 0 : `by ${playlist.ownerName ?? "Unknown"} • ${playlist.tracksTotal ?? 0}`} tracks
        </div>
      </div>
    </Link>
  );
}