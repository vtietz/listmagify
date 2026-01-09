/**
 * PlaybackControls - Playback buttons (shuffle, prev, play/pause, next, repeat) and progress bar.
 */

'use client';

import { useCallback, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/format';

interface PlaybackControlsProps {
  isPlaying: boolean;
  isLoading: boolean;
  shuffleState?: boolean;
  repeatState?: 'off' | 'track' | 'context';
  restrictions?: {
    togglingShuffle?: boolean;
    skippingPrev?: boolean;
    skippingNext?: boolean;
    togglingRepeat?: boolean;
    seeking?: boolean;
  };
  progressMs: number;
  durationMs: number;
  onTogglePlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onSeek: (positionMs: number) => void;
}

export function PlaybackControls({
  isPlaying,
  isLoading,
  shuffleState,
  repeatState,
  restrictions,
  progressMs,
  durationMs,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onToggleShuffle,
  onCycleRepeat,
  onSeek,
}: PlaybackControlsProps) {
  const progressRef = useRef<HTMLDivElement>(null);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !durationMs || restrictions?.seeking) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = x / rect.width;
    const newPosition = Math.round(percent * durationMs);
    
    onSeek(newPosition);
  }, [durationMs, onSeek, restrictions?.seeking]);

  const progressPercent = durationMs > 0 ? (progressMs / durationMs) * 100 : 0;

  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {/* Shuffle */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 shrink-0',
            shuffleState && 'text-green-500',
            restrictions?.togglingShuffle && 'opacity-40 cursor-not-allowed'
          )}
          onClick={onToggleShuffle}
          disabled={restrictions?.togglingShuffle}
          title={restrictions?.togglingShuffle ? 'Shuffle requires Premium' : 'Toggle shuffle'}
        >
          <Shuffle className="h-4 w-4" />
        </Button>

        {/* Previous */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 shrink-0',
            restrictions?.skippingPrev && 'opacity-40 cursor-not-allowed'
          )}
          onClick={onPrevious}
          disabled={isLoading || restrictions?.skippingPrev}
          title={restrictions?.skippingPrev ? 'Skip back requires Premium' : 'Previous track'}
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        {/* Play/Pause */}
        <Button
          variant="default"
          size="icon"
          className="h-9 w-9 rounded-full shrink-0"
          onClick={onTogglePlayPause}
          disabled={isLoading}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </Button>

        {/* Next */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 shrink-0',
            restrictions?.skippingNext && 'opacity-40 cursor-not-allowed'
          )}
          onClick={onNext}
          disabled={isLoading || restrictions?.skippingNext}
          title={restrictions?.skippingNext ? 'Skip forward requires Premium' : 'Next track'}
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        {/* Repeat */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 shrink-0',
            repeatState !== 'off' && 'text-green-500',
            restrictions?.togglingRepeat && 'opacity-40 cursor-not-allowed'
          )}
          onClick={onCycleRepeat}
          disabled={restrictions?.togglingRepeat}
          title={restrictions?.togglingRepeat ? 'Repeat requires Premium' : `Repeat: ${repeatState ?? 'off'}`}
        >
          {repeatState === 'track' ? (
            <Repeat1 className="h-4 w-4" />
          ) : (
            <Repeat className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Progress bar */}
      <div className="w-full flex items-center gap-2 px-2">
        <span className="text-xs text-muted-foreground w-10 text-right tabular-nums shrink-0">
          {formatDuration(progressMs)}
        </span>
        <div
          ref={progressRef}
          className={cn(
            "flex-1 h-1 bg-muted rounded-full group min-w-0",
            restrictions?.seeking ? "cursor-default" : "cursor-pointer"
          )}
          onClick={handleSeek}
          title={restrictions?.seeking ? 'Seeking requires Premium' : undefined}
        >
          <div
            className={cn(
              "h-full bg-foreground rounded-full relative transition-colors",
              !restrictions?.seeking && "group-hover:bg-green-500"
            )}
            style={{ width: `${progressPercent}%` }}
          >
            {!restrictions?.seeking && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground w-10 tabular-nums shrink-0">
          {formatDuration(durationMs)}
        </span>
      </div>
    </div>
  );
}
