import { usePlayerStore } from '@features/player/hooks/usePlayerStore';
import type { Track } from '@/lib/music-provider/types';

type PlaybackState = ReturnType<typeof usePlayerStore.getState>['playbackState'];
type PlaybackContext = ReturnType<typeof usePlayerStore.getState>['playbackContext'];

export function getActivePlayPosition({
  isPlayingPanel,
  playbackState,
  filteredTracks,
}: {
  isPlayingPanel: boolean;
  playbackState: PlaybackState;
  filteredTracks: Track[];
}) {
  if (!isPlayingPanel || !playbackState?.isPlaying || !playbackState.track?.id) {
    return -1;
  }
  const activeTrackIndex = filteredTracks.findIndex((track) => track.id === playbackState.track?.id);
  return filteredTracks[activeTrackIndex]?.position ?? activeTrackIndex;
}

function hasPlayingTrackInPanel(filteredTracks: Track[], isTrackPlaying: (trackId: string | null) => boolean): boolean {
  return filteredTracks.some((track) => isTrackPlaying(track.id));
}

function matchesCurrentTrackId(playbackState: PlaybackState, filteredTracks: Track[]): boolean {
  const currentlyPlayingTrackId = playbackState?.track?.id;
  return Boolean(currentlyPlayingTrackId && filteredTracks.some((track) => track.id === currentlyPlayingTrackId));
}

function getCurrentContextTrackUri(playbackContext: PlaybackContext): string | undefined {
  if (!playbackContext) {
    return undefined;
  }

  return playbackContext.trackUris[playbackContext.currentIndex];
}

function matchesCurrentContextTrack(playbackContext: PlaybackContext, filteredTracks: Track[]): boolean {
  const currentContextTrackUri = getCurrentContextTrackUri(playbackContext);
  return Boolean(currentContextTrackUri && filteredTracks.some((track) => track.uri === currentContextTrackUri));
}

function matchesPlaybackStateContextPlaylist(
  playbackState: PlaybackState,
  playlistId: string | null | undefined,
): boolean {
  if (!playlistId) {
    return false;
  }

  return playbackState?.context?.uri === `spotify:playlist:${playlistId}`;
}

export function resolvePlayingPanelState({
  panelId,
  playlistId,
  playbackContext,
  playbackState,
  filteredTracks,
  isTrackPlaying,
}: {
  panelId: string;
  playlistId: string | null | undefined;
  playbackContext: PlaybackContext;
  playbackState: PlaybackState;
  filteredTracks: Track[];
  isTrackPlaying: (trackId: string | null) => boolean;
}): boolean {
  return Boolean(
    playbackContext?.sourceId === panelId
    || (playlistId && playbackContext?.playlistId === playlistId)
    || matchesPlaybackStateContextPlaylist(playbackState, playlistId)
    || (playbackState?.isPlaying && hasPlayingTrackInPanel(filteredTracks, isTrackPlaying))
    || matchesCurrentTrackId(playbackState, filteredTracks)
    || matchesCurrentContextTrack(playbackContext, filteredTracks)
  );
}
