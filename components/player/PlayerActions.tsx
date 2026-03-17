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

interface SharedActionsProps {
  trackId: string | null;
  trackUri: string | null;
  trackName: string | null;
  trackArtists: string[];
  isLiked: boolean;
  hasActiveMarkers: boolean;
  totalMarkers: number;
  isInserting: boolean;
  volumePercent: number;
  deviceName?: string | null | undefined;
  deviceIsActive: boolean;
  isVolumePopoverOpen: boolean;
  showPlaylistDialog: boolean;
  onToggleLike: () => void;
  onAddClick: () => void;
  onMuteToggle: () => void;
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeviceClick: () => void;
  onVolumePopoverChange: (open: boolean) => void;
  onPlaylistDialogClose: () => void;
}

function VolumeIcon({ volumePercent }: { volumePercent: number }) {
  return volumePercent === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />;
}

interface LikeButtonProps {
  trackId: string | null;
  isLiked: boolean;
  shrink?: boolean;
  onToggleLike: () => void;
}

function LikeButton({ trackId, isLiked, shrink, onToggleLike }: LikeButtonProps) {
  if (!trackId) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(shrink ? 'h-8 w-8 shrink-0' : 'h-8 w-8', isLiked && 'text-green-500')}
      onClick={onToggleLike}
      title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
    >
      <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
    </Button>
  );
}

interface AddButtonProps {
  trackUri: string | null;
  hasActiveMarkers: boolean;
  totalMarkers: number;
  isInserting: boolean;
  shrink?: boolean;
  onAddClick: () => void;
}

function AddButton({ trackUri, hasActiveMarkers, totalMarkers, isInserting, shrink, onAddClick }: AddButtonProps) {
  if (!trackUri) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        shrink ? 'h-8 w-8 shrink-0' : 'h-8 w-8',
        hasActiveMarkers ? 'text-orange-500' : 'text-muted-foreground'
      )}
      onClick={onAddClick}
      disabled={isInserting}
      title={
        hasActiveMarkers
          ? `Add to ${totalMarkers} marked position${totalMarkers > 1 ? 's' : ''}`
          : 'Add to playlist'
      }
    >
      {isInserting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
    </Button>
  );
}

function DeviceButton({ deviceIsActive, deviceName, onDeviceClick }: {
  deviceIsActive: boolean;
  deviceName?: string | null | undefined;
  onDeviceClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8', deviceIsActive && 'text-green-500')}
      onClick={onDeviceClick}
      title={deviceName ?? 'Select device'}
    >
      <MonitorSpeaker className="h-4 w-4" />
    </Button>
  );
}

function PlaylistDialogConditional({ trackUri, trackName, trackArtists, showPlaylistDialog, onClose }: {
  trackUri: string | null;
  trackName: string | null;
  trackArtists: string[];
  showPlaylistDialog: boolean;
  onClose: () => void;
}) {
  if (!trackUri || !trackName) return null;
  return (
    <AddToPlaylistDialog
      isOpen={showPlaylistDialog}
      onClose={onClose}
      trackUri={trackUri}
      trackName={trackName}
      trackArtists={trackArtists}
      currentPlaylistId={null}
    />
  );
}

function MobilePlayerActions({
  trackId,
  trackUri,
  trackName,
  trackArtists,
  isLiked,
  hasActiveMarkers,
  totalMarkers,
  isInserting,
  volumePercent,
  deviceIsActive,
  deviceName,
  isVolumePopoverOpen,
  showPlaylistDialog,
  onToggleLike,
  onAddClick,
  onMuteToggle,
  onVolumeChange,
  onDeviceClick,
  onVolumePopoverChange,
  onPlaylistDialogClose,
}: SharedActionsProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <LikeButton trackId={trackId} isLiked={isLiked} onToggleLike={onToggleLike} />
        <AddButton trackUri={trackUri} hasActiveMarkers={hasActiveMarkers} totalMarkers={totalMarkers} isInserting={isInserting} onAddClick={onAddClick} />
      </div>

      <div className="flex items-center gap-2">
        <Popover open={isVolumePopoverOpen} onOpenChange={onVolumePopoverChange}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" title={`Volume: ${volumePercent}%`}>
              <VolumeIcon volumePercent={volumePercent} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" side="top" align="end">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Volume</span>
                <span className="text-sm text-muted-foreground">{volumePercent}%</span>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onMuteToggle}>
                  <VolumeIcon volumePercent={volumePercent} />
                </Button>
                <input type="range" min="0" max="100" value={volumePercent} onChange={onVolumeChange} className="flex-1 h-2 accent-foreground cursor-pointer" />
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <DeviceButton deviceIsActive={deviceIsActive} deviceName={deviceName} onDeviceClick={onDeviceClick} />
      </div>

      <PlaylistDialogConditional trackUri={trackUri} trackName={trackName} trackArtists={trackArtists} showPlaylistDialog={showPlaylistDialog} onClose={onPlaylistDialogClose} />
    </div>
  );
}

function DesktopPlayerActions({
  trackId,
  trackUri,
  trackName,
  trackArtists,
  isLiked,
  hasActiveMarkers,
  totalMarkers,
  isInserting,
  volumePercent,
  deviceIsActive,
  deviceName,
  showPlaylistDialog,
  onToggleLike,
  onAddClick,
  onMuteToggle,
  onVolumeChange,
  onDeviceClick,
  onPlaylistDialogClose,
}: SharedActionsProps) {
  return (
    <div className="flex items-center gap-2 justify-end">
      <LikeButton trackId={trackId} isLiked={isLiked} shrink onToggleLike={onToggleLike} />
      <AddButton trackUri={trackUri} hasActiveMarkers={hasActiveMarkers} totalMarkers={totalMarkers} isInserting={isInserting} shrink onAddClick={onAddClick} />

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMuteToggle} title="Mute/Unmute">
          <VolumeIcon volumePercent={volumePercent} />
        </Button>
        <input type="range" min="0" max="100" value={volumePercent} onChange={onVolumeChange} className="w-20 h-1 accent-foreground cursor-pointer" title={`Volume: ${volumePercent}%`} />
      </div>

      <DeviceButton deviceIsActive={deviceIsActive} deviceName={deviceName} onDeviceClick={onDeviceClick} />
      <PlaylistDialogConditional trackUri={trackUri} trackName={trackName} trackArtists={trackArtists} showPlaylistDialog={showPlaylistDialog} onClose={onPlaylistDialogClose} />
    </div>
  );
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

  const sharedProps: SharedActionsProps = {
    trackId,
    trackUri,
    trackName,
    trackArtists,
    isLiked,
    hasActiveMarkers,
    totalMarkers,
    isInserting,
    volumePercent,
    deviceName,
    deviceIsActive,
    isVolumePopoverOpen,
    showPlaylistDialog,
    onToggleLike,
    onAddClick: handleAddClick,
    onMuteToggle: handleMuteToggle,
    onVolumeChange: handleVolumeChange,
    onDeviceClick,
    onVolumePopoverChange: setIsVolumePopoverOpen,
    onPlaylistDialogClose: () => setShowPlaylistDialog(false),
  };

  if (isMobile) {
    return <MobilePlayerActions {...sharedProps} />;
  }

  return <DesktopPlayerActions {...sharedProps} />;
}
