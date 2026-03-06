import { useCallback } from 'react';
import type * as React from 'react';
import { useLongPress } from '@/hooks/useLongPress';
import type { MarkerActions, ReorderActions, TrackActions } from '../../TrackContextMenu';
import type { Track } from '@/lib/music-provider/types';
import type { MobileOverlay } from '../../mobile/MobileBottomNav';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';

interface UseTrackRowHandlersInput {
  track: Track;
  index: number;
  selectionKey: string;
  onSelect: (selectionKey: string, index: number, event: React.MouseEvent) => void;
  onClick: (selectionKey: string, index: number) => void;
  showHandle: boolean;
  isMultiSelect: boolean;
  onToggleLiked: ((trackId: string, currentlyLiked: boolean) => void) | undefined;
  isLiked: boolean;
  isPlaying: boolean;
  onPlay: ((trackUri: string) => void) | undefined;
  onPause: (() => void) | undefined;
  setSearchQuery: (q: string) => void;
  openBrowsePanel: () => void;
  isPhone: boolean;
  setMobileOverlay: (overlay: MobileOverlay) => void;
  openContextMenu: ReturnType<typeof useContextMenuStore.getState>['openMenu'];
  isSelected: boolean;
  selectedCount: number;
  isEditable: boolean;
  panelId: string | undefined;
  fullMarkerActions: MarkerActions;
  fullTrackActions: TrackActions;
  reorderActions: ReorderActions | undefined;
}

export function useTrackRowHandlers({
  track,
  index,
  selectionKey,
  onSelect,
  onClick,
  showHandle,
  isMultiSelect,
  onToggleLiked,
  isLiked,
  isPlaying,
  onPlay,
  onPause,
  setSearchQuery,
  openBrowsePanel,
  isPhone,
  setMobileOverlay,
  openContextMenu,
  isSelected,
  selectedCount,
  isEditable,
  panelId,
  fullMarkerActions,
  fullTrackActions,
  reorderActions,
}: UseTrackRowHandlersInput) {
  const { wasLongPress, resetLongPress, ...longPressTouchHandlers } = useLongPress({
    delay: 350,
    onLongPress: useCallback(() => {
      onSelect(selectionKey, index, { ctrlKey: true, metaKey: false, shiftKey: false } as React.MouseEvent);
    }, [onSelect, selectionKey, index]),
    disabled: !showHandle,
  });

  const handleArtistClick = useCallback(
    (e: React.MouseEvent, artistName: string) => {
      e.stopPropagation();
      e.preventDefault();
      setSearchQuery(`artist:"${artistName}"`);
      if (isPhone) {
        setMobileOverlay('search');
      } else {
        openBrowsePanel();
      }
    },
    [setSearchQuery, isPhone, setMobileOverlay, openBrowsePanel],
  );

  const handleAlbumClick = useCallback(
    (e: React.MouseEvent, albumName: string) => {
      e.stopPropagation();
      e.preventDefault();
      setSearchQuery(`album:"${albumName}"`);
      if (isPhone) {
        setMobileOverlay('search');
      } else {
        openBrowsePanel();
      }
    },
    [setSearchQuery, isPhone, setMobileOverlay, openBrowsePanel],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        onSelect(selectionKey, index, e);
        return;
      }
      if (showHandle && isMultiSelect) {
        e.preventDefault();
        onSelect(selectionKey, index, { ctrlKey: true, metaKey: false, shiftKey: false } as React.MouseEvent);
        return;
      }
      onClick(selectionKey, index);
    },
    [onSelect, selectionKey, index, showHandle, isMultiSelect, onClick],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  }, []);

  const handleHeartClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!track.id) return;
      onToggleLiked?.(track.id, isLiked);
    },
    [track.id, onToggleLiked, isLiked],
  );

  const handlePlayClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (isPlaying) {
        onPause?.();
      } else {
        onPlay?.(track.uri);
      }
    },
    [isPlaying, onPause, onPlay, track.uri],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (showHandle) return;

      if (wasLongPress()) {
        resetLongPress();
        return;
      }

      const showMulti = isSelected && isMultiSelect && selectedCount > 1;
      openContextMenu({
        track,
        position: { x: e.clientX, y: e.clientY },
        isMultiSelect: showMulti,
        selectedCount: showMulti ? selectedCount : 1,
        isEditable,
        panelId: panelId || '',
        markerActions: fullMarkerActions,
        trackActions: fullTrackActions,
        reorderActions: reorderActions || {},
      });
    },
    [
      showHandle,
      wasLongPress,
      resetLongPress,
      isSelected,
      isMultiSelect,
      selectedCount,
      openContextMenu,
      track,
      isEditable,
      panelId,
      fullMarkerActions,
      fullTrackActions,
      reorderActions,
    ],
  );

  const handleMoreButtonClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const showMulti = isSelected && isMultiSelect && selectedCount > 1;

      openContextMenu({
        track,
        position: { x: rect.right, y: rect.top },
        isMultiSelect: showMulti,
        selectedCount: showMulti ? selectedCount : 1,
        isEditable,
        panelId: panelId || '',
        markerActions: fullMarkerActions,
        trackActions: fullTrackActions,
        reorderActions: reorderActions || {},
      });
    },
    [
      isSelected,
      isMultiSelect,
      selectedCount,
      openContextMenu,
      track,
      isEditable,
      panelId,
      fullMarkerActions,
      fullTrackActions,
      reorderActions,
    ],
  );

  return {
    longPressTouchHandlers,
    handleArtistClick,
    handleAlbumClick,
    handleClick,
    handleMouseDown,
    handleHeartClick,
    handlePlayClick,
    handleContextMenu,
    handleMoreButtonClick,
  };
}
