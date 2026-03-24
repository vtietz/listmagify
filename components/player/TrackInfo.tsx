/**
 * TrackInfo - Displays current track with album art and metadata.
 * Draggable on desktop to add track to playlists.
 */

'use client';

import { GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { Track } from '@/lib/music-provider/types';
import { MarqueeText } from '@/components/ui/marquee-text';
import { useHydratedAutoScrollText } from '@/hooks/useAutoScrollTextStore';
import { ArtworkImage } from '@/components/shared/ArtworkImage';

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
  onTrackClick?: ((trackId: string) => void) | undefined;
}

function getTrackContainerClassName(isDraggable: boolean, isDragging: boolean, hasTrackId: boolean): string {
  return cn(
    'flex items-center gap-3 min-w-0 group/track-info rounded-md p-1 -m-1 transition-colors',
    isDraggable && 'cursor-grab hover:bg-accent/50 touch-action-none',
    isDragging && 'opacity-50 cursor-grabbing',
    !hasTrackId && 'cursor-default'
  );
}

function getDragTitle(trackId: string | null, isDraggable: boolean): string {
  if (!trackId) {
    return 'Local files cannot be added to playlists';
  }

  return isDraggable ? 'Drag to add to a playlist' : '';
}

function toTrackForDrag(track: TrackInfoProps['track']): Track {
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: track.artists,
    artistObjects: track.artists.map((name) => ({ id: null, name })),
    durationMs: track.durationMs,
    album: track.albumName
      ? {
          name: track.albumName,
          image: track.albumImage ? { url: track.albumImage } : null,
        }
      : null,
  };
}

function TrackDragHandle({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <GripVertical className="h-5 w-5 text-muted-foreground/70 group-hover/track-info:text-muted-foreground transition-colors shrink-0" />
  );
}

function TrackAlbumImage({
  albumImage,
  albumName,
}: {
  albumImage?: string | null | undefined;
  albumName?: string | null | undefined;
}) {
  if (!albumImage) {
    return null;
  }

  return (
    // Artwork is 56×56px (Tailwind h-14 w-14)
    <ArtworkImage
      src={albumImage}
      alt={albumName ?? 'Album art'}
      width={56}
      height={56}
      className="rounded object-contain bg-black/10 shadow shrink-0 hover:opacity-80 transition-opacity"
    />
  );
}

function TrackMetadata({
  track,
  isAutoScrollEnabled,
  isClickable,
  onClick,
}: {
  track: TrackInfoProps['track'];
  isAutoScrollEnabled: boolean;
  isClickable: boolean;
  onClick: () => void;
}) {
  const artistLabel = track.artists.join(', ');
  const detailsLabel = track.albumName ? `${artistLabel} • ${track.albumName}` : artistLabel;

  return (
    <div
      className={cn('flex items-center gap-3 min-w-0 flex-1', isClickable && 'cursor-pointer')}
      onClick={onClick}
      title={isClickable ? 'Click to scroll to this track in playlists' : undefined}
    >
      <TrackAlbumImage albumImage={track.albumImage} albumName={track.albumName} />
      <div className="min-w-0 flex-1">
        <MarqueeText
          isAutoScrollEnabled={isAutoScrollEnabled}
          className="text-sm font-medium hover:opacity-80 transition-opacity"
          title={track.name}
        >
          {track.name}
        </MarqueeText>
        <MarqueeText
          isAutoScrollEnabled={isAutoScrollEnabled}
          className="text-xs text-muted-foreground hover:opacity-80 transition-opacity"
          title={detailsLabel}
        >
          {artistLabel} {track.albumName && `• ${track.albumName}`}
        </MarqueeText>
      </div>
    </div>
  );
}

export function TrackInfo({ track, isMobileDevice, onTrackClick }: TrackInfoProps) {
  const isAutoScrollEnabled = useHydratedAutoScrollText();

  const hasTrackId = Boolean(track.id);
  const isDraggable = hasTrackId && !isMobileDevice;
  const isClickable = Boolean(track.id && onTrackClick);

  const handleTrackClick = () => {
    if (!track.id || !onTrackClick) {
      return;
    }

      onTrackClick(track.id);
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: `player-track-${track.id || track.uri}`,
    disabled: !isDraggable,
    data: {
      type: 'track',
      trackId: track.id,
      track: toTrackForDrag(track),
      panelId: 'player',
      playlistId: undefined,
      position: 0,
    },
  });

  const dragBindings = isDraggable ? { ...attributes, ...listeners } : {};

  return (
    <div 
      ref={setNodeRef}
      className={getTrackContainerClassName(isDraggable, isDragging, hasTrackId)}
      {...dragBindings}
      title={getDragTitle(track.id, isDraggable)}
    >
      <TrackDragHandle visible={isDraggable} />
      <TrackMetadata
        track={track}
        isAutoScrollEnabled={isAutoScrollEnabled}
        isClickable={isClickable}
        onClick={handleTrackClick}
      />
    </div>
  );
}
