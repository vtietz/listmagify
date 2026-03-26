/**
 * MiniPlayer - Compact single-line player for mobile and small viewport heights.
 * 
 * Features:
 * - Same height as a track row (~44px)
 * - Small artwork
 * - Play/Pause toggle button (changes state icon)
 * - Previous/Next buttons
 * - Play time display
 * - Device selector button
 * - Heart (like) button
 * - Close button (X) to hide - but auto-shows when playback starts
 */

'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Plus,
  MonitorSpeaker,
  X,
  Loader2,
} from 'lucide-react';
import { useSpotifyPlayer } from '@features/player/hooks/useSpotifyPlayer';
import { useMusicProviderId } from '@features/auth/hooks/useMusicProviderId';
import { useSavedTracksIndex } from '@features/playlists/hooks/useSavedTracksIndex';
import { useInsertionPointsStore, computeInsertionPositions } from '@features/split-editor/playlist/hooks/useInsertionPointsStore';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { AddToPlaylistDialog } from '@/components/playlist/AddToPlaylistDialog';
import { DeviceSelector } from './DeviceSelector';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/format';
import { toast } from '@/lib/ui/toast';
import { MarqueeText } from '@/components/ui/marquee-text';
import { useHydratedAutoScrollText } from '@features/split-editor/hooks/useAutoScrollTextStore';
import type { PlaybackTrack } from '@/lib/music-provider/types';
import { ArtworkImage } from '@shared/ui/ArtworkImage';

function MiniPlayerControls({
  isLoading,
  isPlaying,
  onPrevious,
  onTogglePlayPause,
  onNext,
}: {
  isLoading: boolean;
  isPlaying: boolean;
  onPrevious: () => void;
  onTogglePlayPause: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPrevious} disabled={isLoading}>
        <SkipBack className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onTogglePlayPause} disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNext} disabled={isLoading}>
        <SkipForward className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function MiniPlayerActions({
  trackId,
  trackUri,
  isLiked,
  hasActiveMarkers,
  totalMarkers,
  isInserting,
  deviceIsActive,
  onToggleLike,
  onAddClick,
  onDeviceClick,
  onHide,
}: {
  trackId: string | null;
  trackUri: string;
  isLiked: boolean;
  hasActiveMarkers: boolean;
  totalMarkers: number;
  isInserting: boolean;
  deviceIsActive: boolean;
  onToggleLike: () => void;
  onAddClick: () => void;
  onDeviceClick: () => void;
  onHide: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {trackId && (
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', isLiked && 'text-green-500')}
          onClick={onToggleLike}
        >
          <Heart className={cn('h-3.5 w-3.5', isLiked && 'fill-current')} />
        </Button>
      )}
      {trackUri && (
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', hasActiveMarkers ? 'text-orange-500' : 'text-muted-foreground')}
          onClick={onAddClick}
          disabled={isInserting}
          title={
            hasActiveMarkers
              ? `Add to ${totalMarkers} marked position${totalMarkers > 1 ? 's' : ''}`
              : 'Add to playlist'
          }
        >
          {isInserting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-7 w-7', deviceIsActive && 'text-green-500')}
        onClick={onDeviceClick}
      >
        <MonitorSpeaker className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onHide}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function MiniPlayerTrackInfo({
  track,
  isAutoScrollEnabled,
  localProgress,
  durationMs,
  onTrackClick,
}: {
  track: PlaybackTrack;
  isAutoScrollEnabled: boolean;
  localProgress: number;
  durationMs: number;
  onTrackClick?: (() => void) | undefined;
}) {
  return (
    <>
      {track.albumImage && (
        // Artwork is 32×32px (Tailwind h-8 w-8)
        <ArtworkImage
          src={track.albumImage}
          alt={track.albumName ?? 'Album art'}
          width={32}
          height={32}
          className={cn(
            'rounded object-contain bg-black/10 shrink-0',
            onTrackClick && 'cursor-pointer hover:opacity-80 transition-opacity'
          )}
          onClick={onTrackClick}
          title={onTrackClick ? 'Click to scroll to this track in playlists' : undefined}
        />
      )}
      <div
        className={cn(
          'flex-1 min-w-0 overflow-hidden',
          onTrackClick && 'cursor-pointer hover:opacity-80 transition-opacity'
        )}
        onClick={onTrackClick}
        title={onTrackClick ? 'Click to scroll to this track in playlists' : undefined}
      >
        <MarqueeText
          isAutoScrollEnabled={isAutoScrollEnabled}
          className="text-xs font-medium leading-tight"
          title={track.name}
        >
          {track.name}
        </MarqueeText>
        <MarqueeText
          isAutoScrollEnabled={isAutoScrollEnabled}
          className="text-[10px] text-muted-foreground leading-tight"
          title={track.artists.join(', ')}
        >
          {track.artists.join(', ')}
        </MarqueeText>
      </div>
      <div className="text-[10px] text-muted-foreground tabular-nums shrink-0 flex flex-col items-end leading-tight">
        <div>{formatDuration(localProgress)}</div>
        <div>{formatDuration(durationMs)}</div>
      </div>
    </>
  );
}

function useMiniPlayerProgress(progressMs: number, isPlaying: boolean, durationMs: number) {
  const [localProgress, setLocalProgress] = useState(progressMs);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setLocalProgress(progressMs);
  }, [progressMs]);

  useEffect(() => {
    if (!isPlaying || !durationMs) {
      return;
    }

    let lastFrameTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastFrameTime;

      if (elapsed >= 33) {
        setLocalProgress((prev) => Math.min(prev + elapsed, durationMs));
        lastFrameTime = now;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, durationMs]);

  return localProgress;
}

function useMiniTrackLike(trackId: string | null | undefined) {
  const { isLiked: checkIsLiked, toggleLiked } = useSavedTracksIndex();
  const isLiked = trackId ? checkIsLiked(trackId) : false;

  const handleToggleLike = useCallback(() => {
    if (!trackId) {
      return;
    }

    toggleLiked(trackId, isLiked);
  }, [trackId, isLiked, toggleLiked]);

  return { isLiked, handleToggleLike };
}

function useMiniInsertionMarkers(track?: PlaybackTrack | null) {
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const addTracksMutation = useAddTracks();
  const [isInserting, setIsInserting] = useState(false);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);

  const playlistsWithMarkers = Object.entries(playlists).filter(([, data]) => data.markers.length > 0);
  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);

  const handleAddToMarkers = useCallback(async () => {
    if (!track?.uri || isInserting) {
      return;
    }

    setIsInserting(true);

    try {
      let insertedCount = 0;

      for (const [playlistId, data] of playlistsWithMarkers) {
        if (data.markers.length === 0) {
          continue;
        }

        const positions = computeInsertionPositions(data.markers, 1);

        await addTracksMutation.mutateAsync({
          playlistId,
          trackUris: [track.uri],
          position: positions[0]!.effectiveIndex,
        });

        insertedCount += 1;
        shiftAfterMultiInsert(playlistId);
      }

      toast.success(
        `Added "${track.name}" to ${insertedCount} playlist${insertedCount > 1 ? 's' : ''} (${totalMarkers} marker${totalMarkers > 1 ? 's' : ''})`
      );
    } catch (error) {
      console.error('[MiniPlayer] Failed to add to markers:', error);
      toast.error('Failed to add track to markers');
    } finally {
      setIsInserting(false);
    }
  }, [track, isInserting, playlistsWithMarkers, totalMarkers, addTracksMutation, shiftAfterMultiInsert]);

  const handleAddClick = useCallback(() => {
    if (hasActiveMarkers) {
      void handleAddToMarkers();
      return;
    }

    setShowPlaylistDialog(true);
  }, [hasActiveMarkers, handleAddToMarkers]);

  return {
    hasActiveMarkers,
    totalMarkers,
    isInserting,
    showPlaylistDialog,
    setShowPlaylistDialog,
    handleAddClick,
  };
}

function getTrackClickHandler(
  track: PlaybackTrack | null | undefined,
  onTrackClick?: (trackId: string) => void
): (() => void) | undefined {
  if (!track?.id || !onTrackClick) {
    return undefined;
  }

  return () => onTrackClick(track.id!);
}

function MiniPlayerBody({
  track,
  deviceIsActive,
  isAutoScrollEnabled,
  localProgress,
  durationMs,
  isLoading,
  isPlaying,
  isLiked,
  hasActiveMarkers,
  totalMarkers,
  isInserting,
  onTrackClick,
  onPrevious,
  onTogglePlayPause,
  onNext,
  onToggleLike,
  onAddClick,
  onDeviceClick,
  onHide,
}: {
  track: PlaybackTrack;
  deviceIsActive: boolean;
  isAutoScrollEnabled: boolean;
  localProgress: number;
  durationMs: number;
  isLoading: boolean;
  isPlaying: boolean;
  isLiked: boolean;
  hasActiveMarkers: boolean;
  totalMarkers: number;
  isInserting: boolean;
  onTrackClick?: (() => void) | undefined;
  onPrevious: () => void;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onToggleLike: () => void;
  onAddClick: () => void;
  onDeviceClick: () => void;
  onHide: () => void;
}) {
  const progressPercent = durationMs > 0 ? (localProgress / durationMs) * 100 : 0;

  return (
    <div className="h-11 border-t border-border bg-background/95 backdrop-blur flex items-center px-2 gap-2 relative overflow-hidden">
      <div
        className="absolute inset-0 bg-primary/10 transition-all duration-150 ease-linear"
        style={{ width: `${progressPercent}%` }}
      />

      <div className="relative flex items-center gap-2 flex-1 min-w-0 z-10">
        <MiniPlayerTrackInfo
          track={track}
          isAutoScrollEnabled={isAutoScrollEnabled}
          localProgress={localProgress}
          durationMs={durationMs}
          onTrackClick={onTrackClick}
        />
        <MiniPlayerControls
          isLoading={isLoading}
          isPlaying={isPlaying}
          onPrevious={onPrevious}
          onTogglePlayPause={onTogglePlayPause}
          onNext={onNext}
        />
        <MiniPlayerActions
          trackId={track.id}
          trackUri={track.uri}
          isLiked={isLiked}
          hasActiveMarkers={hasActiveMarkers}
          totalMarkers={totalMarkers}
          isInserting={isInserting}
          deviceIsActive={deviceIsActive}
          onToggleLike={onToggleLike}
          onAddClick={onAddClick}
          onDeviceClick={onDeviceClick}
          onHide={onHide}
        />
      </div>
    </div>
  );
}

interface MiniPlayerProps {
  /** Whether to show the mini player (controlled externally) */
  isVisible: boolean;
  /** Callback to hide the mini player */
  onHide: () => void;
  /** Callback when user clicks on track info to scroll to track in playlists */
  onTrackClick?: ((trackId: string) => void) | undefined;
}

function shouldRenderMiniPlayer(
  isVisible: boolean,
  track: PlaybackTrack | null | undefined,
  providerId: ReturnType<typeof useMusicProviderId>,
): track is PlaybackTrack {
  return Boolean(isVisible && track && providerId === 'spotify');
}

export function MiniPlayer({ isVisible, onHide, onTrackClick }: MiniPlayerProps) {
  const providerId = useMusicProviderId();
  const {
    playbackState,
    isPlaying,
    isLoading,
    selectedDeviceId,
    devices,
    isDeviceSelectorOpen,
    togglePlayPause,
    next,
    previous,
    openDeviceSelector,
    closeDeviceSelector,
    transferPlayback,
    refreshDevices,
  } = useSpotifyPlayer();

  const isAutoScrollEnabled = useHydratedAutoScrollText();

  const track = playbackState?.track;
  const device = playbackState?.device;
  const progressMs = playbackState?.progressMs ?? 0;
  const durationMs = track?.durationMs ?? 0;
  const trackId = track?.id;

  const localProgress = useMiniPlayerProgress(progressMs, isPlaying, durationMs);
  const { isLiked, handleToggleLike } = useMiniTrackLike(trackId);
  const {
    hasActiveMarkers,
    totalMarkers,
    isInserting,
    showPlaylistDialog,
    setShowPlaylistDialog,
    handleAddClick,
  } = useMiniInsertionMarkers(track);

  const handleDeviceClick = useCallback(() => {
    refreshDevices();
    openDeviceSelector();
  }, [refreshDevices, openDeviceSelector]);
  const trackClickHandler = getTrackClickHandler(track, onTrackClick);

  // Don't render if not visible or no track
  if (!shouldRenderMiniPlayer(isVisible, track, providerId)) {
    return null;
  }

  return (
    <>
      <MiniPlayerBody
        track={track}
        deviceIsActive={device?.isActive ?? false}
        isAutoScrollEnabled={isAutoScrollEnabled}
        localProgress={localProgress}
        durationMs={durationMs}
        isLoading={isLoading}
        isPlaying={isPlaying}
        isLiked={isLiked}
        hasActiveMarkers={hasActiveMarkers}
        totalMarkers={totalMarkers}
        isInserting={isInserting}
        onTrackClick={trackClickHandler}
        onPrevious={previous}
        onTogglePlayPause={togglePlayPause}
        onNext={next}
        onToggleLike={handleToggleLike}
        onAddClick={handleAddClick}
        onDeviceClick={handleDeviceClick}
        onHide={onHide}
      />

      {/* Playlist selector dialog (when no markers) */}
      <AddToPlaylistDialog
        isOpen={showPlaylistDialog}
        onClose={() => setShowPlaylistDialog(false)}
        trackUri={track.uri}
        trackName={track.name}
        trackArtists={track.artists}
        currentPlaylistId={null}
      />

      <DeviceSelector
        isOpen={isDeviceSelectorOpen}
        onClose={closeDeviceSelector}
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={transferPlayback}
        onRefresh={refreshDevices}
      />
    </>
  );
}
