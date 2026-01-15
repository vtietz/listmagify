/**
 * PlayerActions - Like, Add to Markers, Volume, and Device selector buttons.
 */

'use client';

import { useState, useCallback } from 'react';
import { Heart, Plus, Volume2, VolumeX, MonitorSpeaker, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AddToPlaylistDialog } from '@/components/playlist/AddToPlaylistDialog';
import { cn } from '@/lib/utils';

interface PlayerActionsProps {
  trackId: string | null;
  trackUri: string | null;
  trackName: string | null;
  trackArtists?: string[];
  isLiked: boolean;
  hasActiveMarkers: boolean;
  totalMarkers: number;
  isInserting: boolean;
  volumePercent: number;
  deviceName?: string | null | undefined;
  deviceIsActive: boolean;
  isMobile?: boolean;
  onToggleLike: () => void;
  onAddToMarkers: () => void;
  onSetVolume: (volume: number) => void;
  onDeviceClick: () => void;
}

export function PlayerActions({
  trackId,
  trackUri,
  trackName,
  trackArtists = [],
  isLiked,
  hasActiveMarkers,
  totalMarkers,
  isInserting,
  volumePercent,
  deviceName,
  deviceIsActive,
  isMobile = false,
  onToggleLike,
  onAddToMarkers,
  onSetVolume,
  onDeviceClick,
}: PlayerActionsProps) {
  const [isVolumePopoverOpen, setIsVolumePopoverOpen] = useState(false);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseInt(e.target.value, 10);
    onSetVolume(volume);
  }, [onSetVolume]);

  const handleMuteToggle = useCallback(() => {
    onSetVolume(volumePercent ? 0 : 50);
  }, [volumePercent, onSetVolume]);

  const handleAddClick = useCallback(() => {
    if (hasActiveMarkers) {
      onAddToMarkers();
    } else {
      setShowPlaylistDialog(true);
    }
  }, [hasActiveMarkers, onAddToMarkers]);

  if (isMobile) {
    return (
      <div className="flex items-center justify-between gap-2">
        {/* Left: Like and Add to Markers */}
        <div className="flex items-center gap-1">
          {trackId && (
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8', isLiked && 'text-green-500')}
              onClick={onToggleLike}
              title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
            >
              <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
            </Button>
          )}
          
          {trackUri && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8',
                hasActiveMarkers ? 'text-orange-500' : 'text-muted-foreground'
              )}
              onClick={handleAddClick}
              disabled={isInserting}
              title={
                hasActiveMarkers
                  ? `Add to ${totalMarkers} marked position${totalMarkers > 1 ? 's' : ''}`
                  : 'Add to playlist'
              }
            >
              {isInserting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {/* Right: Volume and Device */}
        <div className="flex items-center gap-2">
          {/* Volume popover */}
          <Popover open={isVolumePopoverOpen} onOpenChange={setIsVolumePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={`Volume: ${volumePercent}%`}
              >
                {volumePercent === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" side="top" align="end">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Volume</span>
                  <span className="text-sm text-muted-foreground">{volumePercent}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={handleMuteToggle}
                  >
                    {volumePercent === 0 ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volumePercent}
                    onChange={handleVolumeChange}
                    className="flex-1 h-2 accent-foreground cursor-pointer"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Device selector button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', deviceIsActive && 'text-green-500')}
            onClick={onDeviceClick}
            title={deviceName ?? 'Select device'}
          >
            <MonitorSpeaker className="h-4 w-4" />
          </Button>
        </div>

        {/* Playlist selector dialog (when no markers) */}
        {trackUri && trackName && (
          <AddToPlaylistDialog
            isOpen={showPlaylistDialog}
            onClose={() => setShowPlaylistDialog(false)}
            trackUri={trackUri}
            trackName={trackName}
            trackArtists={trackArtists}
            currentPlaylistId={null}
          />
        )}
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex items-center gap-2 justify-end">
      {trackId && (
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8 shrink-0', isLiked && 'text-green-500')}
          onClick={onToggleLike}
          title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
        >
          <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
        </Button>
      )}
      
      {trackUri && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 shrink-0',
            hasActiveMarkers ? 'text-orange-500' : 'text-muted-foreground'
          )}
          onClick={handleAddClick}
          disabled={isInserting}
          title={
            hasActiveMarkers
              ? `Add to ${totalMarkers} marked position${totalMarkers > 1 ? 's' : ''}`
              : 'Add to playlist'
          }
        >
          {isInserting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      )}
      
      {/* Volume controls - inline slider */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleMuteToggle}
          title="Mute/Unmute"
        >
          {volumePercent === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
        <input
          type="range"
          min="0"
          max="100"
          value={volumePercent}
          onChange={handleVolumeChange}
          className="w-20 h-1 accent-foreground cursor-pointer"
          title={`Volume: ${volumePercent}%`}
        />
      </div>

      {/* Device selector button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8 shrink-0', deviceIsActive && 'text-green-500')}
        onClick={onDeviceClick}
        title={deviceName ?? 'Select device'}
      >
        <MonitorSpeaker className="h-4 w-4" />
      </Button>

      {/* Playlist selector dialog (when no markers) */}
      {trackUri && trackName && (
        <AddToPlaylistDialog
          isOpen={showPlaylistDialog}
          onClose={() => setShowPlaylistDialog(false)}
          trackUri={trackUri}
          trackName={trackName}
          trackArtists={trackArtists}
          currentPlaylistId={null}
        />
      )}
    </div>
  );
}
