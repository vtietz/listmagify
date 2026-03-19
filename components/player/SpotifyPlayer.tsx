/**
 * SpotifyPlayer component - Mini player bar at the bottom of the app.
 * Shows currently playing track, playback controls, and device selector.
 * Can be toggled visible/hidden via the header menu. Auto-shows when playback starts.
 * Initializes the Web Playback SDK to enable in-browser playback.
 */

'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer';
import { useMusicProviderId } from '@/hooks/useMusicProviderId';
import { useWebPlaybackSDK } from '@/hooks/useWebPlaybackSDK';
import { useSavedTracksIndex } from '@/hooks/useSavedTracksIndex';
import { useInsertionPointsStore, computeInsertionPositions } from '@/hooks/useInsertionPointsStore';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { DeviceSelector } from './DeviceSelector';
import { TrackInfo } from './TrackInfo';
import { PlaybackControls } from './PlaybackControls';
import { PlayerActions } from './PlayerActions';
import { EmptyPlayerState } from './EmptyPlayerState';
import { toast } from '@/lib/ui/toast';
import { cn } from '@/lib/utils';
import { useDeviceType } from '@/hooks/useDeviceType';
import type { PlaybackTrack } from '@/lib/music-provider/types';

function useInsertionMarkers() {
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const addTracksMutation = useAddTracks();
  const [isInserting, setIsInserting] = useState(false);

  const playlistsWithMarkers = Object.entries(playlists).filter(
    ([, data]) => data.markers.length > 0
  );
  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);

  return { isInserting, setIsInserting, hasActiveMarkers, totalMarkers, playlistsWithMarkers, addTracksMutation, shiftAfterMultiInsert };
}

function useTrackLike(trackId: string | null) {
  const { isLiked, toggleLiked } = useSavedTracksIndex();
  const trackIsLiked = trackId ? isLiked(trackId) : false;

  const handleToggleLike = useCallback(() => {
    if (!trackId) {
      return;
    }

    toggleLiked(trackId, trackIsLiked);
  }, [trackId, trackIsLiked, toggleLiked]);

  return { trackIsLiked, handleToggleLike };
}

function useAddToMarkersAction({
  track,
  isInserting,
  setIsInserting,
  playlistsWithMarkers,
  totalMarkers,
  addTracksMutation,
  shiftAfterMultiInsert,
}: {
  track?: PlaybackTrack | null | undefined;
  isInserting: boolean;
  setIsInserting: (value: boolean) => void;
  playlistsWithMarkers: ReturnType<typeof useInsertionMarkers>['playlistsWithMarkers'];
  totalMarkers: number;
  addTracksMutation: ReturnType<typeof useAddTracks>;
  shiftAfterMultiInsert: (playlistId: string, options?: { fromIndex?: number }) => void;
}) {
  return useCallback(async () => {
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
      console.error('[Player] Failed to add to markers:', error);
      toast.error('Failed to add track to markers');
    } finally {
      setIsInserting(false);
    }
  }, [
    track,
    isInserting,
    setIsInserting,
    playlistsWithMarkers,
    totalMarkers,
    addTracksMutation,
    shiftAfterMultiInsert,
  ]);
}

function ResponsivePlayerActions({
  track,
  trackIsLiked,
  hasActiveMarkers,
  totalMarkers,
  isInserting,
  volumePercent,
  deviceName,
  deviceIsActive,
  onToggleLike,
  onAddToMarkers,
  onSetVolume,
  onDeviceClick,
}: {
  track: PlaybackTrack;
  trackIsLiked: boolean;
  hasActiveMarkers: boolean;
  totalMarkers: number;
  isInserting: boolean;
  volumePercent: number;
  deviceName?: string | undefined;
  deviceIsActive: boolean;
  onToggleLike: () => void;
  onAddToMarkers: () => void;
  onSetVolume: (volumePercent: number) => Promise<void>;
  onDeviceClick: () => void;
}) {
  const commonProps = {
    trackId: track.id,
    trackUri: track.uri,
    trackName: track.name,
    trackArtists: track.artists,
    isLiked: trackIsLiked,
    hasActiveMarkers,
    totalMarkers,
    isInserting,
    volumePercent,
    deviceName,
    deviceIsActive,
    onToggleLike,
    onAddToMarkers,
    onSetVolume,
    onDeviceClick,
  };

  return (
    <>
      <div className="hidden lg:block">
        <PlayerActions {...commonProps} />
      </div>
      <div className="lg:hidden">
        <PlayerActions {...commonProps} isMobile />
      </div>
    </>
  );
}

function PlayerDeviceSelector({
  isOpen,
  onClose,
  devices,
  selectedDeviceId,
  onSelectDevice,
  onRefresh,
}: {
  isOpen: boolean;
  onClose: () => void;
  devices: ReturnType<typeof useSpotifyPlayer>['devices'];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => Promise<void>;
  onRefresh: () => void;
}) {
  return (
    <DeviceSelector
      isOpen={isOpen}
      onClose={onClose}
      devices={devices}
      selectedDeviceId={selectedDeviceId}
      onSelectDevice={onSelectDevice}
      onRefresh={onRefresh}
    />
  );
}

function SpotifyPlayerEmptyView({
  isWebPlayerReady,
  isWebPlayerInitializing,
  onDeviceClick,
  deviceSelectorProps,
}: {
  isWebPlayerReady: boolean;
  isWebPlayerInitializing: boolean;
  onDeviceClick: () => void;
  deviceSelectorProps: Parameters<typeof PlayerDeviceSelector>[0];
}) {
  return (
    <>
      <EmptyPlayerState
        isWebPlayerReady={isWebPlayerReady}
        isWebPlayerInitializing={isWebPlayerInitializing}
        onDeviceClick={onDeviceClick}
      />
      <PlayerDeviceSelector {...deviceSelectorProps} />
    </>
  );
}

function SpotifyPlayerTrackView({
  setDropNodeRef,
  isOver,
  track,
  isMobileDevice,
  onTrackClick,
  isPlaying,
  isLoading,
  shuffleState,
  repeatState,
  restrictions,
  localProgress,
  durationMs,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onToggleShuffle,
  onCycleRepeat,
  onSeek,
  trackIsLiked,
  hasActiveMarkers,
  totalMarkers,
  isInserting,
  volumePercent,
  deviceName,
  deviceIsActive,
  onToggleLike,
  onAddToMarkers,
  onSetVolume,
  onDeviceClick,
  deviceSelectorProps,
}: {
  setDropNodeRef: (element: HTMLElement | null) => void;
  isOver: boolean;
  track: PlaybackTrack;
  isMobileDevice: boolean;
  onTrackClick?: ((trackId: string) => void) | undefined;
  isPlaying: boolean;
  isLoading: boolean;
  shuffleState: boolean | undefined;
  repeatState: 'off' | 'track' | 'context' | undefined;
  restrictions: ReturnType<typeof useSpotifyPlayer>['playbackState'] extends infer T
    ? T extends { restrictions: infer R }
      ? R
      : undefined
    : undefined;
  localProgress: number;
  durationMs: number;
  onTogglePlayPause: () => Promise<void>;
  onPrevious: () => Promise<void>;
  onNext: () => Promise<void>;
  onToggleShuffle: () => Promise<void>;
  onCycleRepeat: () => Promise<void>;
  onSeek: (positionMs: number) => Promise<void>;
  trackIsLiked: boolean;
  hasActiveMarkers: boolean;
  totalMarkers: number;
  isInserting: boolean;
  volumePercent: number;
  deviceName?: string | undefined;
  deviceIsActive: boolean;
  onToggleLike: () => void;
  onAddToMarkers: () => void;
  onSetVolume: (volumePercent: number) => Promise<void>;
  onDeviceClick: () => void;
  deviceSelectorProps: Parameters<typeof PlayerDeviceSelector>[0];
}) {
  return (
    <div
      ref={setDropNodeRef}
      className={cn(
        'h-auto min-h-20 border-t border-border bg-background/95 backdrop-blur px-4 py-3 transition-colors',
        isOver && 'bg-primary/10'
      )}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_200px] gap-4 items-center">
        <TrackInfo track={track} isMobileDevice={isMobileDevice} onTrackClick={onTrackClick} />

        <PlaybackControls
          isPlaying={isPlaying}
          isLoading={isLoading}
          shuffleState={shuffleState}
          repeatState={repeatState}
          restrictions={restrictions}
          progressMs={localProgress}
          durationMs={durationMs}
          onTogglePlayPause={onTogglePlayPause}
          onPrevious={onPrevious}
          onNext={onNext}
          onToggleShuffle={onToggleShuffle}
          onCycleRepeat={onCycleRepeat}
          onSeek={onSeek}
        />

        <ResponsivePlayerActions
          track={track}
          trackIsLiked={trackIsLiked}
          hasActiveMarkers={hasActiveMarkers}
          totalMarkers={totalMarkers}
          isInserting={isInserting}
          volumePercent={volumePercent}
          deviceName={deviceName}
          deviceIsActive={deviceIsActive}
          onToggleLike={onToggleLike}
          onAddToMarkers={onAddToMarkers}
          onSetVolume={onSetVolume}
          onDeviceClick={onDeviceClick}
        />
      </div>

      <PlayerDeviceSelector {...deviceSelectorProps} />
    </div>
  );
}

function getPlayerDerivedState(playbackState: ReturnType<typeof useSpotifyPlayer>['playbackState']) {
  const track = playbackState?.track;
  const device = playbackState?.device;
  const progressMs = playbackState?.progressMs ?? 0;
  const durationMs = track?.durationMs ?? 0;
  const volumePercent = device?.volumePercent ?? 50;
  const deviceIsActive = device?.isActive ?? false;

  return {
    track,
    device,
    progressMs,
    durationMs,
    volumePercent,
    deviceIsActive,
    trackId: track?.id,
  };
}

function usePlayerViewportFlags() {
  const { isPhone, isTablet } = useDeviceType();
  return { isMobileDevice: isPhone || isTablet };
}

function useSpotifyPlayerViewModel() {
  const { isReady: isWebPlayerReady, isInitializing: isWebPlayerInitializing } = useWebPlaybackSDK();
  const { isMobileDevice } = usePlayerViewportFlags();

  const player = useSpotifyPlayer();
  const derived = getPlayerDerivedState(player.playbackState);

  const [isSeekDragging, _setIsSeekDragging] = useState(false);
  const localProgress = useProgressAnimation({
    isPlaying: player.isPlaying,
    isSeekDragging,
    durationMs: derived.durationMs,
    progressMs: derived.progressMs,
  });

  const insertion = useInsertionMarkers();
  const { trackIsLiked, handleToggleLike } = useTrackLike(derived.trackId ?? null);

  const handleAddToMarkers = useAddToMarkersAction({
    track: derived.track,
    isInserting: insertion.isInserting,
    setIsInserting: insertion.setIsInserting,
    playlistsWithMarkers: insertion.playlistsWithMarkers,
    totalMarkers: insertion.totalMarkers,
    addTracksMutation: insertion.addTracksMutation,
    shiftAfterMultiInsert: insertion.shiftAfterMultiInsert,
  });

  const handleDeviceClick = () => {
    player.refreshDevices();
    player.openDeviceSelector();
  };

  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: 'player-droppable',
    data: {
      type: 'player',
      accepts: ['track'],
    },
  });

  return {
    isWebPlayerReady,
    isWebPlayerInitializing,
    isMobileDevice,
    player,
    track: derived.track,
    device: derived.device,
    volumePercent: derived.volumePercent,
    deviceIsActive: derived.deviceIsActive,
    durationMs: derived.durationMs,
    localProgress,
    insertion,
    trackIsLiked,
    handleToggleLike,
    handleAddToMarkers,
    handleDeviceClick,
    setDropNodeRef,
    isOver,
  };
}

function shouldHidePlayer(forceShow: boolean, isPlayerVisible: boolean): boolean {
  return !forceShow && !isPlayerVisible;
}

function useProgressAnimation({
  isPlaying,
  isSeekDragging,
  durationMs,
  progressMs,
}: {
  isPlaying: boolean;
  isSeekDragging: boolean;
  durationMs: number;
  progressMs: number;
}): number {
  const [localProgress, setLocalProgress] = useState(progressMs);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!isSeekDragging) {
      setLocalProgress(progressMs);
    }
  }, [progressMs, isSeekDragging]);

  useEffect(() => {
    if (!isPlaying || isSeekDragging || !durationMs) return;

    let lastFrameTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastFrameTime;

      if (elapsed >= 33) {
        setLocalProgress(prev => Math.min(prev + elapsed, durationMs));
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
  }, [isPlaying, isSeekDragging, durationMs]);

  return localProgress;
}

interface SpotifyPlayerProps {
  /** Force the player to show regardless of isPlayerVisible state (for mobile overlay) */
  forceShow?: boolean;
  /** Callback when user clicks on track info to scroll to track in playlists */
  onTrackClick?: (trackId: string) => void;
}

export function SpotifyPlayer({ forceShow = false, onTrackClick }: SpotifyPlayerProps) {
  const providerId = useMusicProviderId();
  const model = useSpotifyPlayerViewModel();

  if (providerId !== 'spotify') {
    return null;
  }

  if (shouldHidePlayer(forceShow, model.player.isPlayerVisible)) {
    return null;
  }

  const deviceSelectorProps = {
    isOpen: model.player.isDeviceSelectorOpen,
    onClose: model.player.closeDeviceSelector,
    devices: model.player.devices,
    selectedDeviceId: model.player.selectedDeviceId,
    onSelectDevice: model.player.transferPlayback,
    onRefresh: model.player.refreshDevices,
  };

  if (!model.track) {
    return (
      <SpotifyPlayerEmptyView
        isWebPlayerReady={model.isWebPlayerReady}
        isWebPlayerInitializing={model.isWebPlayerInitializing}
        onDeviceClick={model.handleDeviceClick}
        deviceSelectorProps={deviceSelectorProps}
      />
    );
  }

  return (
    <SpotifyPlayerTrackView
      setDropNodeRef={model.setDropNodeRef}
      isOver={model.isOver}
      track={model.track}
      isMobileDevice={model.isMobileDevice}
      onTrackClick={onTrackClick}
      isPlaying={model.player.isPlaying}
      isLoading={model.player.isLoading}
      shuffleState={model.player.playbackState?.shuffleState}
      repeatState={model.player.playbackState?.repeatState}
      restrictions={model.player.playbackState?.restrictions}
      localProgress={model.localProgress}
      durationMs={model.durationMs}
      onTogglePlayPause={model.player.togglePlayPause}
      onPrevious={model.player.previous}
      onNext={model.player.next}
      onToggleShuffle={model.player.toggleShuffle}
      onCycleRepeat={model.player.cycleRepeat}
      onSeek={model.player.seek}
      trackIsLiked={model.trackIsLiked}
      hasActiveMarkers={model.insertion.hasActiveMarkers}
      totalMarkers={model.insertion.totalMarkers}
      isInserting={model.insertion.isInserting}
      volumePercent={model.volumePercent}
      deviceName={model.device?.name}
      deviceIsActive={model.deviceIsActive}
      onToggleLike={model.handleToggleLike}
      onAddToMarkers={model.handleAddToMarkers}
      onSetVolume={model.player.setVolume}
      onDeviceClick={model.handleDeviceClick}
      deviceSelectorProps={deviceSelectorProps}
    />
  );
}
