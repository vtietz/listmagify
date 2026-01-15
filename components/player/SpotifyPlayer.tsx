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

interface SpotifyPlayerProps {
  /** Force the player to show regardless of isPlayerVisible state (for mobile overlay) */
  forceShow?: boolean;
}

export function SpotifyPlayer({ forceShow = false }: SpotifyPlayerProps) {
  const { isReady: isWebPlayerReady, isInitializing: isWebPlayerInitializing } = useWebPlaybackSDK();
  const { isPhone, isTablet } = useDeviceType();
  const isMobileDevice = isPhone || isTablet;
  
  const {
    playbackState,
    isPlaying,
    isLoading,
    selectedDeviceId,
    devices,
    isDeviceSelectorOpen,
    isPlayerVisible,
    togglePlayPause,
    next,
    previous,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    openDeviceSelector,
    closeDeviceSelector,
    transferPlayback,
    refreshDevices,
  } = useSpotifyPlayer();

  const [localProgress, setLocalProgress] = useState(0);
  const [isSeekDragging, _setIsSeekDragging] = useState(false);
  const lastUpdateRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const track = playbackState?.track;
  const device = playbackState?.device;
  const progressMs = playbackState?.progressMs ?? 0;
  const durationMs = track?.durationMs ?? 0;

  const playlists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const addTracksMutation = useAddTracks();
  const [isInserting, setIsInserting] = useState(false);

  const playlistsWithMarkers = Object.entries(playlists).filter(
    ([, data]) => data.markers.length > 0
  );
  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);

  const { isLiked, toggleLiked } = useSavedTracksIndex();
  const trackIsLiked = track?.id ? isLiked(track.id) : false;

  const handleToggleLike = useCallback(() => {
    if (!track?.id) return;
    toggleLiked(track.id, trackIsLiked);
  }, [track?.id, trackIsLiked, toggleLiked]);

  const handleAddToMarkers = useCallback(async () => {
    if (!track?.uri || isInserting) return;

    setIsInserting(true);
    try {
      let insertedCount = 0;

      for (const [playlistId, data] of playlistsWithMarkers) {
        if (data.markers.length === 0) continue;

        const positions = computeInsertionPositions(data.markers, 1);

        await addTracksMutation.mutateAsync({
          playlistId,
          trackUris: [track.uri],
          position: positions[0]!.effectiveIndex,
        });

        insertedCount++;
        shiftAfterMultiInsert(playlistId);
      }

      toast.success(`Added "${track.name}" to ${insertedCount} playlist${insertedCount > 1 ? 's' : ''} (${totalMarkers} marker${totalMarkers > 1 ? 's' : ''})`);
    } catch (error) {
      console.error('[Player] Failed to add to markers:', error);
      toast.error('Failed to add track to markers');
    } finally {
      setIsInserting(false);
    }
  }, [track, isInserting, playlistsWithMarkers, totalMarkers, addTracksMutation, shiftAfterMultiInsert]);

  const handleDeviceClick = useCallback(() => {
    refreshDevices();
    openDeviceSelector();
  }, [refreshDevices, openDeviceSelector]);

  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: 'player-droppable',
    data: {
      type: 'player',
      accepts: ['track'],
    },
  });

  useEffect(() => {
    if (!isSeekDragging) {
      setLocalProgress(progressMs);
      lastUpdateRef.current = Date.now();
    }
  }, [progressMs, isSeekDragging]);

  useEffect(() => {
    if (!isPlaying || isSeekDragging || !durationMs) return;

    let lastFrameTime = Date.now();
    
    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastFrameTime;
      
      if (elapsed >= 33) {
        setLocalProgress(prev => {
          const newProgress = prev + elapsed;
          return Math.min(newProgress, durationMs);
        });
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

  const handleSeek = useCallback((positionMs: number) => {
    setLocalProgress(positionMs);
    seek(positionMs);
  }, [seek]);

  if (!forceShow && !isPlayerVisible) {
    return null;
  }

  if (!track) {
    return (
      <>
        <EmptyPlayerState
          isWebPlayerReady={isWebPlayerReady}
          isWebPlayerInitializing={isWebPlayerInitializing}
          onDeviceClick={handleDeviceClick}
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

  return (
    <div 
      ref={setDropNodeRef}
      className={cn(
        "h-auto min-h-20 border-t border-border bg-background/95 backdrop-blur px-4 py-3 transition-colors",
        isOver && "bg-primary/10"
      )}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_200px] gap-4 items-center">
        <TrackInfo track={track} isMobileDevice={isMobileDevice} />

        <PlaybackControls
          isPlaying={isPlaying}
          isLoading={isLoading}
          shuffleState={playbackState?.shuffleState}
          repeatState={playbackState?.repeatState}
          restrictions={playbackState?.restrictions}
          progressMs={localProgress}
          durationMs={durationMs}
          onTogglePlayPause={togglePlayPause}
          onPrevious={previous}
          onNext={next}
          onToggleShuffle={toggleShuffle}
          onCycleRepeat={cycleRepeat}
          onSeek={handleSeek}
        />

        <div className="hidden lg:block">
          <PlayerActions
            trackId={track.id}
            trackUri={track.uri}
            trackName={track.name}
            trackArtists={track.artists}
            isLiked={trackIsLiked}
            hasActiveMarkers={hasActiveMarkers}
            totalMarkers={totalMarkers}
            isInserting={isInserting}
            volumePercent={device?.volumePercent ?? 50}
            deviceName={device?.name}
            deviceIsActive={device?.isActive ?? false}
            onToggleLike={handleToggleLike}
            onAddToMarkers={handleAddToMarkers}
            onSetVolume={setVolume}
            onDeviceClick={handleDeviceClick}
          />
        </div>

        <div className="lg:hidden">
          <PlayerActions
            trackId={track.id}
            trackUri={track.uri}
            trackName={track.name}
            trackArtists={track.artists}
            isLiked={trackIsLiked}
            hasActiveMarkers={hasActiveMarkers}
            totalMarkers={totalMarkers}
            isInserting={isInserting}
            volumePercent={device?.volumePercent ?? 50}
            deviceName={device?.name}
            deviceIsActive={device?.isActive ?? false}
            isMobile
            onToggleLike={handleToggleLike}
            onAddToMarkers={handleAddToMarkers}
            onSetVolume={setVolume}
            onDeviceClick={handleDeviceClick}
          />
        </div>
      </div>

      <DeviceSelector
        isOpen={isDeviceSelectorOpen}
        onClose={closeDeviceSelector}
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={transferPlayback}
        onRefresh={refreshDevices}
      />
    </div>
  );
}
