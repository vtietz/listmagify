import { useEffect, useRef } from 'react';
import type { PlaybackState } from '@/lib/music-provider/types';
import type { Track } from '@/lib/music-provider/types';
import type { Virtualizer } from '@tanstack/react-virtual';

interface UseAutoScrollPlaybackProps {
  panelId: string;
  isPlayingPanel: boolean;
  autoScrollEnabled: boolean;
  playbackState: PlaybackState | null;
  filteredTracks: Track[];
  virtualizer: Virtualizer<HTMLDivElement, Element> | null;
  playlistId: string | null | undefined;
}

export function useAutoScrollPlayback({
  panelId: _panelId,
  isPlayingPanel,
  autoScrollEnabled,
  playbackState,
  filteredTracks,
  virtualizer,
  playlistId,
}: UseAutoScrollPlaybackProps): void {
  const prevAutoScrollRef = useRef(autoScrollEnabled);

  // Immediately scroll to playing track when toggle is enabled (any panel with the track)
  useEffect(() => {
    const wasDisabled = !prevAutoScrollRef.current;
    const isNowEnabled = autoScrollEnabled;
    prevAutoScrollRef.current = autoScrollEnabled;

    if (wasDisabled && isNowEnabled) {
      if (!playbackState?.track?.id || !virtualizer || !playlistId) return;

      const trackId = playbackState.track.id;
      const trackIndex = filteredTracks.findIndex((track) => track.id === trackId);

      if (trackIndex !== -1) {
        try {
          const targetIndex = Math.max(0, trackIndex - 3);
          virtualizer.scrollToIndex(targetIndex, { align: 'start', behavior: 'smooth' });
        } catch (error) {
          console.error('[PlaylistPanel] Failed to scroll to playing track:', error);
        }
      }
    }
  }, [autoScrollEnabled, playbackState?.track?.id, virtualizer, filteredTracks, playlistId]);

  // Auto-scroll during playback when track changes (only in source panel, when near bottom)
  useEffect(() => {
    if (!autoScrollEnabled || !isPlayingPanel) return;
    if (!playbackState?.track?.id || !virtualizer || !playlistId) return;

    const trackId = playbackState.track.id;
    const trackIndex = filteredTracks.findIndex((track) => track.id === trackId);

    if (trackIndex === -1) return;

    try {
      const range = virtualizer.range;
      if (!range) return;

      const visibleEnd = range.endIndex;
      const isNearBottom = trackIndex >= visibleEnd - 2;

      if (isNearBottom) {
        const targetIndex = Math.min(trackIndex + 3, filteredTracks.length - 1);
        virtualizer.scrollToIndex(targetIndex, { align: 'end', behavior: 'smooth' });
      }
    } catch (error) {
      console.error('[PlaylistPanel] Failed to auto-scroll during playback:', error);
    }
  }, [autoScrollEnabled, isPlayingPanel, playbackState?.track?.id, virtualizer, filteredTracks, playlistId]);
}
