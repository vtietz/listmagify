import { useMemo } from 'react';
import type { MarkerActions, TrackActions } from '../../TrackContextMenu';
import type { Track } from '@/lib/music-provider/types';
import { getProviderEntityUrl } from '@/lib/music-provider/links';

interface UseContextMenuActionsInput {
  track: Track;
  isPlaying: boolean;
  isLiked: boolean;
  contextTrackActions: TrackActions | undefined;
  markerActions: MarkerActions | undefined;
  onPlay: ((trackUri: string) => void) | undefined;
  onPause: (() => void) | undefined;
  onToggleLiked: ((trackId: string, currentlyLiked: boolean) => void) | undefined;
  setSearchQuery: (q: string) => void;
  openBrowsePanel: () => void;
  hasAnyMarkers: boolean;
  hasInsertionMarker: boolean;
  hasInsertionMarkerAfter: boolean;
  playlistId: string | undefined;
  isEditable: boolean;
  trackPosition: number;
  togglePoint: (playlistId: string, position: number) => void;
}

export function useContextMenuActions({
  track,
  isPlaying,
  isLiked,
  contextTrackActions,
  markerActions,
  onPlay,
  onPause,
  onToggleLiked,
  setSearchQuery,
  openBrowsePanel,
  hasAnyMarkers,
  hasInsertionMarker,
  hasInsertionMarkerAfter,
  playlistId,
  isEditable,
  trackPosition,
  togglePoint,
}: UseContextMenuActionsInput) {
  const fullTrackActions = useMemo((): TrackActions => {
    const actions: TrackActions = {
      ...contextTrackActions,
      onPlay: () => onPlay?.(track.uri),
      onGoToArtist: () => {
        const artistName = track.artists?.[0];
        if (artistName) {
          setSearchQuery(`artist:"${artistName}"`);
          openBrowsePanel();
        }
      },
      onGoToAlbum: () => {
        const albumName = track.album?.name;
        if (albumName) {
          setSearchQuery(`album:"${albumName}"`);
          openBrowsePanel();
        }
      },
      isPlaying,
      isLiked,
    };

    if (contextTrackActions?.canRemove !== undefined) {
      actions.canRemove = contextTrackActions.canRemove;
    }
    if (onPause) actions.onPause = onPause;
    if (track.id && onToggleLiked) {
      actions.onToggleLiked = () => onToggleLiked(track.id!, isLiked);
    }
    if (track.id) {
      actions.onOpenInSpotify = () => {
        const url = getProviderEntityUrl('track', track.id!, { uri: track.uri });
        if (!url) {
          return;
        }

        window.open(url, '_blank', 'noopener,noreferrer');
      };
    }

    return actions;
  }, [contextTrackActions, track, onPlay, onPause, onToggleLiked, isLiked, isPlaying, setSearchQuery, openBrowsePanel]);

  const fullMarkerActions = useMemo((): MarkerActions => {
    const actions: MarkerActions = {
      ...markerActions,
      hasAnyMarkers,
      hasMarkerBefore: hasInsertionMarker,
      hasMarkerAfter: hasInsertionMarkerAfter,
    };

    if (playlistId && isEditable) {
      actions.onAddMarkerBefore = () => togglePoint(playlistId, trackPosition);
      actions.onAddMarkerAfter = () => togglePoint(playlistId, trackPosition + 1);
    }

    if (playlistId && isEditable && (hasInsertionMarker || hasInsertionMarkerAfter)) {
      actions.onRemoveMarker = () => {
        if (hasInsertionMarker) togglePoint(playlistId, trackPosition);
        if (hasInsertionMarkerAfter) togglePoint(playlistId, trackPosition + 1);
      };
    }

    return actions;
  }, [markerActions, hasAnyMarkers, hasInsertionMarker, hasInsertionMarkerAfter, playlistId, isEditable, trackPosition, togglePoint]);

  return { fullTrackActions, fullMarkerActions };
}
