/**
 * TrackInfo - Displays current track with album art and metadata.
 * Draggable on desktop to add track to playlists.
 */

'use client';

import { GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { Track } from '@/lib/spotify/types';
import { MarqueeText } from '@/components/ui/marquee-text';
import { useHydratedAutoScrollText } from '@/hooks/useAutoScrollTextStore';

interface TrackInfoProps {
  track: {
    id: string | null;
    uri: string;
    name: string;
    artists: string[];
    albumName?: string | null;
    albumImage?: string | null;
    durationMs: number;
  };
  isMobileDevice: boolean;
}

export function TrackInfo({ track, isMobileDevice }: TrackInfoProps) {
  const isAutoScrollEnabled = useHydratedAutoScrollText();
  
  // Convert to Track format for drag data
  const trackForDrag: Track | null = track ? {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: track.artists,
    artistObjects: track.artists.map(name => ({ id: null, name })),
    durationMs: track.durationMs,
    album: track.albumName ? { 
      name: track.albumName, 
      image: track.albumImage ? { url: track.albumImage } : null 
    } : null,
  } : null;

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: `player-track-${track.id || track.uri}`,
    disabled: !track.id || isMobileDevice,
    data: {
      type: 'track',
      trackId: track.id,
      track: trackForDrag,
      panelId: 'player',
      playlistId: undefined,
      position: 0,
    },
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-3 min-w-0 group/track-info rounded-md p-1 -m-1 transition-colors",
        track.id && !isMobileDevice && "cursor-grab hover:bg-accent/50 touch-action-none",
        isDragging && "opacity-50 cursor-grabbing",
        !track.id && "cursor-default"
      )}
      {...(track.id && !isMobileDevice ? { ...attributes, ...listeners } : {})}
      title={track.id && !isMobileDevice ? "Drag to add to a playlist" : track.id ? "" : "Local files cannot be added to playlists"}
    >
      {track.id && !isMobileDevice && (
        <GripVertical className="h-5 w-5 text-muted-foreground/70 group-hover/track-info:text-muted-foreground transition-colors shrink-0" />
      )}
      {track.albumImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.albumImage}
          alt={track.albumName ?? 'Album art'}
          className="h-14 w-14 rounded object-contain bg-black/10 shadow shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <MarqueeText
          isAutoScrollEnabled={isAutoScrollEnabled}
          className="text-sm font-medium"
          title={track.name}
        >
          {track.name}
        </MarqueeText>
        <MarqueeText
          isAutoScrollEnabled={isAutoScrollEnabled}
          className="text-xs text-muted-foreground"
          title={`${track.artists.join(', ')}${track.albumName ? ` • ${track.albumName}` : ''}`}
        >
          {track.artists.join(', ')} {track.albumName && `• ${track.albumName}`}
        </MarqueeText>
      </div>
    </div>
  );
}
