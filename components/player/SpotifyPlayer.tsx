/**
 * SpotifyPlayer component - Mini player bar at the bottom of the app.
 * Shows currently playing track, playback controls, and device selector.
 * Can be toggled visible/hidden via the header menu. Auto-shows when playback starts.
 * Initializes the Web Playback SDK to enable in-browser playback.
 */

'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer';
import { useWebPlaybackSDK } from '@/hooks/useWebPlaybackSDK';
import { DeviceSelector } from './DeviceSelector';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/format';

export function SpotifyPlayer() {
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
  const [isDragging, setIsDragging] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastUpdateRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const track = playbackState?.track;
  const device = playbackState?.device;
  const progressMs = playbackState?.progressMs ?? 0;
  const durationMs = track?.durationMs ?? 0;

  // Update local progress from playback state
  useEffect(() => {
    if (!isDragging) {
      setLocalProgress(progressMs);
      lastUpdateRef.current = Date.now();
    }
  }, [progressMs, isDragging]);

  // Animate progress bar while playing using requestAnimationFrame
  // This is more efficient than setInterval and syncs with browser paint cycles
  useEffect(() => {
    if (!isPlaying || isDragging || !durationMs) return;

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
  }, [isPlaying, isDragging, durationMs]);

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
  if (!isPlayerVisible) {
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
    <div className="h-20 border-t border-border bg-background/95 backdrop-blur px-4 flex items-center gap-4">
      {/* Track info */}
      <div className="flex items-center gap-3 w-[280px] min-w-[180px]">
        {track.albumImage && (
          <img
            src={track.albumImage}
            alt={track.albumName ?? 'Album art'}
            className="h-14 w-14 rounded shadow"
          />
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{track.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {track.artists.join(', ')}
          </div>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex-1 flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          {/* Shuffle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8',
              playbackState?.shuffleState && 'text-green-500'
            )}
            onClick={toggleShuffle}
            title="Toggle shuffle"
          >
            <Shuffle className="h-4 w-4" />
          </Button>

          {/* Previous */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={previous}
            disabled={isLoading}
            title="Previous track"
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          {/* Play/Pause */}
          <Button
            variant="default"
            size="icon"
            className="h-9 w-9 rounded-full"
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

          {/* Next */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={next}
            disabled={isLoading}
            title="Next track"
          >
            <SkipForward className="h-4 w-4" />
          </Button>

          {/* Repeat */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8',
              playbackState?.repeatState !== 'off' && 'text-green-500'
            )}
            onClick={cycleRepeat}
            title={`Repeat: ${playbackState?.repeatState ?? 'off'}`}
          >
            {playbackState?.repeatState === 'track' ? (
              <Repeat1 className="h-4 w-4" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Progress bar */}
        <div className="w-full flex items-center gap-2 px-2">
          <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
            {formatDuration(localProgress)}
          </span>
          <div
            ref={progressRef}
            className="flex-1 h-1 bg-muted rounded-full cursor-pointer group"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-foreground rounded-full relative group-hover:bg-green-500 transition-colors"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <span className="text-xs text-muted-foreground w-10 tabular-nums">
            {formatDuration(durationMs)}
          </span>
        </div>
      </div>

      {/* Volume & Device */}
      <div className="flex items-center gap-3 w-[200px] justify-end">
        {/* Volume slider */}
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
            'h-8 w-8',
            device?.isActive && 'text-green-500'
          )}
          onClick={handleDeviceClick}
          title={device?.name ?? 'Select device'}
        >
          <MonitorSpeaker className="h-4 w-4" />
        </Button>
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
