/**
 * Hook for managing track selection state, helpers, and keyboard navigation.
 */

'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { getTrackSelectionKey } from '@/lib/dnd/selection';
import { useTrackListSelection } from '@/hooks/useTrackListSelection';
import type { Track } from '@/lib/spotify/types';
import type { Virtualizer } from '@tanstack/react-virtual';

interface UseSelectionManagementOptions {
  filteredTracks: Track[];
  selection: Set<string>;
  panelId: string;
  setSelection: (panelId: string, keys: string[]) => void;
  toggleSelection: (panelId: string, key: string) => void;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  isCompact: boolean;
  canDelete: boolean;
  onDeleteWithAutoSelect: (nextIndexToSelect: number | null) => void;
}

export function useSelectionManagement({
  filteredTracks,
  selection,
  panelId,
  setSelection,
  toggleSelection,
  virtualizer,
  isCompact,
  canDelete,
  onDeleteWithAutoSelect,
}: UseSelectionManagementOptions) {
  // Selection key function
  const selectionKey = useCallback(
    (track: Track, index: number) => getTrackSelectionKey(track, index),
    []
  );

  // Prune selection when tracks change (reorders can change positions)
  useEffect(() => {
    if (selection.size === 0) return;

    const validKeys = new Set<string>();
    for (let i = 0; i < filteredTracks.length; i++) {
      const track = filteredTracks[i];
      if (!track) continue;
      validKeys.add(getTrackSelectionKey(track, i));
    }

    const currentSelection = Array.from(selection).filter(
      (key): key is string => typeof key === 'string' && key.length > 0
    );
    const nextSelection = currentSelection.filter((key) => validKeys.has(key));
    if (nextSelection.length !== currentSelection.length) {
      setSelection(panelId, nextSelection);
    }
  }, [filteredTracks, panelId, selection, setSelection]);

  // Delete confirmation state
  const pendingDeleteNextIndexRef = useRef<number | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  // Handler for DEL key - single track deletes immediately, multiple shows confirmation
  const handleDeleteKeyPress = useCallback(
    (selectionCount: number, nextIndexToSelect: number | null) => {
      if (selectionCount === 1) {
        onDeleteWithAutoSelect(nextIndexToSelect);
      } else {
        pendingDeleteNextIndexRef.current = nextIndexToSelect;
        setShowDeleteConfirmation(true);
      }
    },
    [onDeleteWithAutoSelect]
  );

  // Handler for confirming multi-track delete
  const handleConfirmMultiDelete = useCallback(() => {
    setShowDeleteConfirmation(false);
    onDeleteWithAutoSelect(pendingDeleteNextIndexRef.current);
    pendingDeleteNextIndexRef.current = null;
  }, [onDeleteWithAutoSelect]);

  // Use the track list selection hook for click/keyboard handling
  const {
    handleTrackClick,
    handleTrackSelect,
    handleKeyDownNavigation,
    focusedIndex,
  } = useTrackListSelection({
    filteredTracks,
    selection,
    panelId,
    setSelection,
    toggleSelection,
    virtualizer,
    selectionKey,
    onDeleteKeyPress: handleDeleteKeyPress,
    canDelete,
    isCompact,
  });

  // Clear selection helper
  const clearSelection = useCallback(() => {
    setSelection(panelId, []);
  }, [panelId, setSelection]);

  // Get first selected track and its index
  const getFirstSelectedTrack = useCallback((): { track: Track; index: number } | null => {
    for (let i = 0; i < filteredTracks.length; i++) {
      const track = filteredTracks[i];
      if (!track) continue;
      const key = getTrackSelectionKey(track, i);
      if (selection.has(key)) {
        return { track, index: i };
      }
    }
    return null;
  }, [filteredTracks, selection]);

  // Get selection bounds (first and last selected track positions)
  const getSelectionBounds = useCallback((): {
    firstIndex: number;
    lastIndex: number;
    firstPosition: number;
    lastPosition: number;
  } | null => {
    let firstIndex = -1;
    let lastIndex = -1;

    for (let i = 0; i < filteredTracks.length; i++) {
      const track = filteredTracks[i];
      if (!track) continue;
      const key = getTrackSelectionKey(track, i);
      if (selection.has(key)) {
        if (firstIndex === -1) firstIndex = i;
        lastIndex = i;
      }
    }

    if (firstIndex === -1) return null;

    const firstTrack = filteredTracks[firstIndex];
    const lastTrack = filteredTracks[lastIndex];

    return {
      firstIndex,
      lastIndex,
      firstPosition: firstTrack?.position ?? firstIndex,
      lastPosition: lastTrack?.position ?? lastIndex,
    };
  }, [filteredTracks, selection]);

  // Get URIs of selected tracks
  const getSelectedTrackUris = useCallback((): string[] => {
    const uris: string[] = [];
    filteredTracks.forEach((track: Track, index: number) => {
      const key = getTrackSelectionKey(track, index);
      if (selection.has(key)) {
        uris.push(track.uri);
      }
    });
    return uris;
  }, [filteredTracks, selection]);

  return {
    selectionKey,
    handleTrackClick,
    handleTrackSelect,
    handleKeyDownNavigation,
    focusedIndex,
    clearSelection,
    getFirstSelectedTrack,
    getSelectionBounds,
    getSelectedTrackUris,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    handleConfirmMultiDelete,
  };
}
