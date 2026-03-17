'use client';

import { useMemo } from 'react';
import type React from 'react';
import { X } from 'lucide-react';
import type { Track } from '@/lib/music-provider/types';
import { makeCompositeId } from '@/lib/dnd/id';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TrackRow } from '../TrackRow';

interface RecommendationsListProps {
  recommendations: Array<{ trackId: string; score: number; rank: number; track?: Track }>;
  rowHeight: number;
  panelId: string;
  isLiked: (trackId: string) => boolean;
  onToggleLiked: (trackId: string, currentlyLiked: boolean) => void;
  onDismiss: (trackId: string) => void;
  isTrackPlaying: (trackId: string) => boolean;
  isTrackLoading: (uri: string) => boolean;
  onPlay: (trackUri: string) => void;
  onPause: () => void;
  onSelect: (_selectionKey: string, index: number, event: React.MouseEvent) => void;
  onClick: (_selectionKey: string, index: number) => void;
  getCompareColorForTrack: (trackUri: string) => string;
  recsSelection: number[];
  getSelectedTracks: () => Track[];
}

export function RecommendationsList({
  recommendations,
  rowHeight,
  panelId,
  isLiked,
  onToggleLiked,
  onDismiss,
  isTrackPlaying,
  isTrackLoading,
  onPlay,
  onPause,
  onSelect,
  onClick,
  getCompareColorForTrack,
  recsSelection,
  getSelectedTracks,
}: RecommendationsListProps) {
  const tracks = useMemo(() =>
    recommendations
      .filter(r => r.track)
      .map((r, idx) => ({
        ...r.track!,
        position: idx,
        score: r.score,
      })),
    [recommendations]
  );

  return (
    <div className="h-full overflow-auto">
      <div className="relative w-full">
        {tracks.map((track, index) => {
          const trackId = track.id || track.uri;
          const compositeId = makeCompositeId(panelId, trackId, index);
          const liked = track.id ? isLiked(track.id) : false;

          const isCurrentSelected = recsSelection.includes(index);
          const selectedTracksForDrag = isCurrentSelected && recsSelection.length > 0
            ? getSelectedTracks()
            : undefined;

          return (
            <div
              key={compositeId}
              style={{ height: rowHeight }}
              className="relative group"
            >
              <TrackRow
                track={track}
                index={index}
                selectionKey={compositeId}
                isSelected={isCurrentSelected}
                isEditable={false}
                locked={false}
                onSelect={onSelect}
                onClick={onClick}
                panelId={panelId}
                dndMode="copy"
                isDragSourceSelected={false}
                showLikedColumn={true}
                isLiked={liked}
                onToggleLiked={onToggleLiked}
                isPlaying={track.id ? isTrackPlaying(track.id) : false}
                isPlaybackLoading={isTrackLoading(track.uri)}
                onPlay={onPlay}
                onPause={onPause}
                compareColor={getCompareColorForTrack(track.uri)}
                isMultiSelect={recsSelection.length > 1}
                selectedCount={recsSelection.length}
                selectedTracks={selectedTracksForDrag}
              />
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6",
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  "text-muted-foreground hover:text-destructive"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (track.id) {
                    onDismiss(track.id);
                  }
                }}
                title="Dismiss recommendation"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
