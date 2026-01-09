/**
 * SpotifyPlayer component - Mini player bar at the bottom of the app.
 * Shows currently playing track, playback controls, and device selector.
 * Can be toggled visible/hidden via the header menu. Auto-shows when playback starts.
 * Initializes the Web Playback SDK to enable in-browser playback.
 */

'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  MonitorSpeaker,
  Loader2,
  GripVertical,
  Heart,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer';
import { useWebPlaybackSDK } from '@/hooks/useWebPlaybackSDK';
import { useToggleSavedTrack } from '@/hooks/useLikedTracks';
import { useInsertionPointsStore, computeInsertionPositions } from '@/hooks/useInsertionPointsStore';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { DeviceSelector } from './DeviceSelector';
import { toast } from '@/lib/ui/toast';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/format';
import type { Track } from '@/lib/spotify/types';

interface SpotifyPlayerProps {
  /** Force the player to show regardless of isPlayerVisible state (for mobile overlay) */
  forceShow?: boolean;
}

export function SpotifyPlayer({ forceShow = false }: SpotifyPlayerProps) {
  // Initialize the Web Playback SDK for in-browser playback
  const { isReady: isWebPlayerReady, isInitializing: isWebPlayerInitializing } = useWebPlaybackSDK();
  
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
  const [isVolumePopoverOpen, setIsVolumePopoverOpen] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastUpdateRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const track = playbackState?.track;
  const device = playbackState?.device;
  const progressMs = playbackState?.progressMs ?? 0;
  const durationMs = track?.durationMs ?? 0;

  // Insertion markers logic
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const addTracksMutation = useAddTracks();
  const [isInserting, setIsInserting] = useState(false);

  // Get all playlists with active markers
  const playlistsWithMarkers = Object.entries(playlists).filter(
    ([, data]) => data.markers.length > 0
  );
  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);

  // Query liked status for the current track
  const { data: likedData } = useQuery({
    queryKey: ['track-liked', track?.id],
    queryFn: async () => {
      if (!track?.id) return false;
      const result = await apiFetch<boolean[]>(`/api/tracks/contains?ids=${track.id}`);
      return result[0] ?? false;
    },
    enabled: !!track?.id,
    staleTime: 30 * 1000, // 30 seconds
  });

  const isLiked = likedData ?? false;

  // Toggle saved track mutation
  const toggleSaved = useToggleSavedTrack({
    playlistId: 'player', // Use special key for player context
    snapshotId: track?.id ?? 'none',
  });

  const handleToggleLike = useCallback(() => {
    if (!track?.id) return;
    toggleSaved.mutate({
      trackId: track.id,
      currentlyLiked: isLiked,
    });
  }, [track?.id, isLiked, toggleSaved]);

  // Handler for adding current track to all marked insertion points
  const handleAddToMarkers = useCallback(async () => {
    if (!track?.uri || isInserting) return;

    setIsInserting(true);
    try {
      let insertedCount = 0;

      for (const [playlistId, data] of playlistsWithMarkers) {
        if (data.markers.length === 0) continue;

        // Compute target positions for this playlist
        const positions = computeInsertionPositions(data.markers, 1);

        await addTracksMutation.mutateAsync({
          playlistId,
          trackUris: [track.uri],
          position: positions[0]!.effectiveIndex, // Use first marker's effective position
        });

        insertedCount++;

        // Update marker indices after insertion
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

  // Convert PlaybackTrack to Track format for drag data
  const trackForDrag: Track | null = track ? {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: track.artists,
    artistObjects: track.artists.map(name => ({ id: null, name })),
    durationMs: track.durationMs,
    album: track.albumName ? { name: track.albumName, image: track.albumImage ? { url: track.albumImage } : null } : null,
  } : null;

  // Set up draggable for the now playing track
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragNodeRef,
    isDragging: isTrackDragging,
  } = useDraggable({
    id: track ? `player-track-${track.id || track.uri}` : 'player-track-empty',
    disabled: !track || !track.id, // Can't drag if no track or if it's a local file
    data: {
      type: 'track',
      trackId: track?.id,
      track: trackForDrag,
      panelId: 'player', // Special panel ID for the player
      playlistId: undefined, // Not from a specific playlist
      position: 0,
    },
  });

  // Update local progress from playback state
  useEffect(() => {
    if (!isSeekDragging) {
      setLocalProgress(progressMs);
      lastUpdateRef.current = Date.now();
    }
  }, [progressMs, isSeekDragging]);

  // Animate progress bar while playing using requestAnimationFrame
  // This is more efficient than setInterval and syncs with browser paint cycles
  useEffect(() => {
    if (!isPlaying || isSeekDragging || !durationMs) return;

    let lastFrameTime = Date.now();
    
    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastFrameTime;
      
      // Only update if enough time has passed (throttle to ~30fps for progress bar)
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

  // Handle seek bar click/drag
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !durationMs) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = x / rect.width;
    const newPosition = Math.round(percent * durationMs);
    
    setLocalProgress(newPosition);
    seek(newPosition);
  }, [durationMs, seek]);

  // Handle volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseInt(e.target.value, 10);
    setVolume(volume);
  }, [setVolume]);

  // Show device selector on click
  const handleDeviceClick = useCallback(() => {
    refreshDevices();
    openDeviceSelector();
  }, [refreshDevices, openDeviceSelector]);

  const progressPercent = durationMs > 0 ? (localProgress / durationMs) * 100 : 0;

  // Hidden state - render nothing (toggle is in the header menu)
  // forceShow overrides the visibility check (used for mobile overlay)
  if (!forceShow && !isPlayerVisible) {
    return null;
  }

  // If nothing is playing, show minimal bar with status
  if (!track) {
    return (
      <div className="h-20 border-t border-border bg-background/95 backdrop-blur px-4 flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          {isWebPlayerInitializing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Initializing player...</span>
            </>
          ) : isWebPlayerReady ? (
            <>
              <MonitorSpeaker className="h-5 w-5 text-green-500" />
              <span className="text-sm">Ready to play</span>
            </>
          ) : (
            <>
              <MonitorSpeaker className="h-5 w-5" />
              <span className="text-sm">No active playback</span>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeviceClick}
            className="ml-2"
          >
            Select Device
          </Button>
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

  return (
    <div className="h-auto min-h-20 border-t border-border bg-background/95 backdrop-blur px-4 py-3">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_200px] gap-4 items-center">
        {/* Track info - draggable to add to playlists */}
        <div 
          ref={setDragNodeRef}
          className={cn(
            "flex items-center gap-3 min-w-0 group/track-info rounded-md p-1 -m-1 transition-colors",
            track.id && "cursor-grab hover:bg-accent/50 touch-action-none",
            isTrackDragging && "opacity-50 cursor-grabbing",
            !track.id && "cursor-default"
          )}
          {...(track.id ? { ...dragAttributes, ...dragListeners } : {})}
          title={track.id ? "Drag to add to a playlist" : "Local files cannot be added to playlists"}
        >
          {/* Drag handle indicator - visible when track can be dragged */}
          {track.id && (
            <GripVertical className="h-5 w-5 text-muted-foreground/70 group-hover/track-info:text-muted-foreground transition-colors shrink-0" />
          )}
          {track.albumImage && (
            <img
              src={track.albumImage}
              alt={track.albumName ?? 'Album art'}
              // Per Spotify guidelines: don't crop artwork, use rounded corners (4px small devices)
              className="h-14 w-14 rounded object-contain bg-black/10 shadow shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{track.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {track.artists.join(', ')} {track.albumName && `• ${track.albumName}`}
            </div>
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex flex-col items-center gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {/* Shuffle - gated by restrictions */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 shrink-0',
                playbackState?.shuffleState && 'text-green-500',
                playbackState?.restrictions?.togglingShuffle && 'opacity-40 cursor-not-allowed'
              )}
              onClick={toggleShuffle}
              disabled={playbackState?.restrictions?.togglingShuffle}
              title={playbackState?.restrictions?.togglingShuffle ? 'Shuffle requires Premium' : 'Toggle shuffle'}
            >
              <Shuffle className="h-4 w-4" />
            </Button>

            {/* Previous - gated by restrictions */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 shrink-0',
                playbackState?.restrictions?.skippingPrev && 'opacity-40 cursor-not-allowed'
              )}
              onClick={previous}
              disabled={isLoading || playbackState?.restrictions?.skippingPrev}
              title={playbackState?.restrictions?.skippingPrev ? 'Skip back requires Premium' : 'Previous track'}
            >
              <SkipBack className="h-4 w-4" />
            </Button>

            {/* Play/Pause */}
            <Button
              variant="default"
              size="icon"
              className="h-9 w-9 rounded-full shrink-0"
              onClick={togglePlayPause}
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

            {/* Next - gated by restrictions */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 shrink-0',
                playbackState?.restrictions?.skippingNext && 'opacity-40 cursor-not-allowed'
              )}
              onClick={next}
              disabled={isLoading || playbackState?.restrictions?.skippingNext}
              title={playbackState?.restrictions?.skippingNext ? 'Skip forward requires Premium' : 'Next track'}
            >
              <SkipForward className="h-4 w-4" />
            </Button>

            {/* Repeat - gated by restrictions */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 shrink-0',
                playbackState?.repeatState !== 'off' && 'text-green-500',
                playbackState?.restrictions?.togglingRepeat && 'opacity-40 cursor-not-allowed'
              )}
              onClick={cycleRepeat}
              disabled={playbackState?.restrictions?.togglingRepeat}
              title={playbackState?.restrictions?.togglingRepeat ? 'Repeat requires Premium' : `Repeat: ${playbackState?.repeatState ?? 'off'}`}
            >
              {playbackState?.repeatState === 'track' ? (
                <Repeat1 className="h-4 w-4" />
              ) : (
                <Repeat className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Progress bar - seeking gated by restrictions */}
          <div className="w-full flex items-center gap-2 px-2">
            <span className="text-xs text-muted-foreground w-10 text-right tabular-nums shrink-0">
              {formatDuration(localProgress)}
            </span>
            <div
              ref={progressRef}
              className={cn(
                "flex-1 h-1 bg-muted rounded-full group min-w-0",
                playbackState?.restrictions?.seeking 
                  ? "cursor-default" 
                  : "cursor-pointer"
              )}
              onClick={playbackState?.restrictions?.seeking ? undefined : handleSeek}
              title={playbackState?.restrictions?.seeking ? 'Seeking requires Premium' : undefined}
            >
              <div
                className={cn(
                  "h-full bg-foreground rounded-full relative transition-colors",
                  !playbackState?.restrictions?.seeking && "group-hover:bg-green-500"
                )}
                style={{ width: `${progressPercent}%` }}
              >
                {/* Only show seek handle when seeking is allowed */}
                {!playbackState?.restrictions?.seeking && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground w-10 tabular-nums shrink-0">
              {formatDuration(durationMs)}
            </span>
          </div>
        </div>

        {/* Desktop: Volume, Like, Add to Markers & Device */}
        <div className="hidden lg:flex items-center gap-2 justify-end">
          {/* Like button */}
          {track.id && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 shrink-0',
                isLiked && 'text-green-500'
              )}
              onClick={handleToggleLike}
              title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
            >
              <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
            </Button>
          )}
          
          {/* Add to markers button */}
          {track.uri && hasActiveMarkers && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-green-500"
              onClick={handleAddToMarkers}
              disabled={isInserting}
              title={`Add to ${totalMarkers} marked position${totalMarkers > 1 ? 's' : ''}`}
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
              onClick={() => setVolume(device?.volumePercent ? 0 : 50)}
              title="Mute/Unmute"
            >
              {device?.volumePercent === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <input
              type="range"
              min="0"
              max="100"
              value={device?.volumePercent ?? 50}
              onChange={handleVolumeChange}
              className="w-20 h-1 accent-foreground cursor-pointer"
              title={`Volume: ${device?.volumePercent ?? 50}%`}
            />
          </div>

          {/* Device selector button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 shrink-0',
              device?.isActive && 'text-green-500'
            )}
            onClick={handleDeviceClick}
            title={device?.name ?? 'Select device'}
          >
            <MonitorSpeaker className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile: Action buttons below progress bar */}
        <div className="flex lg:hidden items-center justify-between gap-2">
          {/* Left: Like and Add to Markers */}
          <div className="flex items-center gap-1">
            {/* Like button */}
            {track.id && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8',
                  isLiked && 'text-green-500'
                )}
                onClick={handleToggleLike}
                title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
              >
                <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
              </Button>
            )}
            
            {/* Add to markers button */}
            {track.uri && hasActiveMarkers && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-green-500"
                onClick={handleAddToMarkers}
                disabled={isInserting}
                title={`Add to ${totalMarkers} marked position${totalMarkers > 1 ? 's' : ''}`}
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
                  title={`Volume: ${device?.volumePercent ?? 50}%`}
                >
                  {device?.volumePercent === 0 ? (
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
                    <span className="text-sm text-muted-foreground">{device?.volumePercent ?? 50}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setVolume(device?.volumePercent ? 0 : 50)}
                    >
                      {device?.volumePercent === 0 ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={device?.volumePercent ?? 50}
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
              className={cn(
                'h-8 w-8',
                device?.isActive && 'text-green-500'
              )}
              onClick={handleDeviceClick}
              title={device?.name ?? 'Select device'}
            >
              <MonitorSpeaker className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Device selector modal */}
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
