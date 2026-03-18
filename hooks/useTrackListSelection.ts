import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent, MutableRefObject } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { Track } from '@/lib/music-provider/types';
import { getNextTrackIndex } from '@/lib/dnd/selection';
import { scrollToIndexIfOutOfView } from '@/lib/utils/virtualScroll';
import {
  TABLE_HEADER_HEIGHT,
  TABLE_HEADER_HEIGHT_COMPACT,
  TRACK_ROW_HEIGHT,
  TRACK_ROW_HEIGHT_COMPACT,
} from '@/components/split-editor/constants';

interface Params {
  filteredTracks: Track[];
  selection: Set<string>;
  panelId: string;
  setSelection: (panelId: string, trackIds: string[]) => void;
  toggleSelection: (panelId: string, trackId: string) => void;
  virtualizer: Virtualizer<any, any>;
  selectionKey: (track: Track, index: number) => string;
  /** Callback for delete key press - receives selection count and next index to select */
  onDeleteKeyPress?: (selectionCount: number, nextIndexToSelect: number | null) => void;
  /** Whether delete is allowed (panel is editable and not locked) */
  canDelete?: boolean;
  /** Whether compact mode is enabled */
  isCompact?: boolean;
}

function findFirstSelectedIndex(
  filteredTracks: Track[],
  selection: Set<string>,
  selectionKey: (track: Track, index: number) => string
): number | null {
  for (let i = 0; i < filteredTracks.length; i++) {
    const track = filteredTracks[i];
    if (track && selection.has(selectionKey(track, i))) {
      return i;
    }
  }

  return null;
}

function getNextSelectionAfterDelete(
  filteredTracksLength: number,
  selectionSize: number,
  firstSelectedIndex: number | null
): number | null {
  if (firstSelectedIndex === null) {
    return null;
  }

  const remainingCount = filteredTracksLength - selectionSize;
  if (remainingCount <= 0) {
    return null;
  }

  return firstSelectedIndex >= remainingCount ? remainingCount - 1 : firstSelectedIndex;
}

function isDeleteKey(key: string): boolean {
  return key === 'Delete' || key === 'Backspace';
}

function getArrowDirection(key: string): 1 | -1 | null {
  if (key === 'ArrowDown') {
    return 1;
  }

  if (key === 'ArrowUp') {
    return -1;
  }

  return null;
}

function tryHandleDeleteKey({
  event,
  canDelete,
  selection,
  onDeleteKeyPress,
  filteredTracks,
  selectionKey,
}: {
  event: KeyboardEvent<HTMLDivElement>;
  canDelete: boolean;
  selection: Set<string>;
  onDeleteKeyPress: ((selectionCount: number, nextIndexToSelect: number | null) => void) | undefined;
  filteredTracks: Track[];
  selectionKey: (track: Track, index: number) => string;
}): boolean {
  if (!isDeleteKey(event.key)) {
    return false;
  }

  if (!canDelete || selection.size === 0 || !onDeleteKeyPress) {
    return true;
  }

  event.preventDefault();
  const firstSelectedIndex = findFirstSelectedIndex(filteredTracks, selection, selectionKey);
  const nextIndexToSelect = getNextSelectionAfterDelete(
    filteredTracks.length,
    selection.size,
    firstSelectedIndex
  );
  onDeleteKeyPress(selection.size, nextIndexToSelect);
  return true;
}

function applyKeyboardRangeSelection({
  nextIndex,
  filteredTracks,
  selection,
  selectionKey,
  panelId,
  setSelection,
  setFocusedIndex,
  lastFocusedIndexRef,
}: {
  nextIndex: number;
  filteredTracks: Track[];
  selection: Set<string>;
  selectionKey: (track: Track, index: number) => string;
  panelId: string;
  setSelection: (panelId: string, trackIds: string[]) => void;
  setFocusedIndex: (index: number | null) => void;
  lastFocusedIndexRef: MutableRefObject<number | null>;
}) {
  let anchorIndex = lastFocusedIndexRef.current;
  if (anchorIndex === null) {
    const firstSelected = filteredTracks.findIndex((track) => selection.has(track.id || track.uri));
    anchorIndex = firstSelected !== -1 ? firstSelected : nextIndex;
    lastFocusedIndexRef.current = anchorIndex;
  }

  const start = Math.min(anchorIndex, nextIndex);
  const end = Math.max(anchorIndex, nextIndex);
  const tracks = filteredTracks.slice(start, end + 1).map((t, i) => selectionKey(t, start + i));
  setSelection(panelId, tracks);
  setFocusedIndex(nextIndex);
}

function setFocusedIndexState(
  index: number,
  setFocusedIndex: (index: number | null) => void,
  lastFocusedIndexRef: MutableRefObject<number | null>
) {
  setFocusedIndex(index);
  lastFocusedIndexRef.current = index;
}

function applyShiftSelection({
  index,
  filteredTracks,
  selection,
  selectionKey,
  setSelection,
  panelId,
  setFocusedIndex,
  lastFocusedIndexRef,
}: {
  index: number;
  filteredTracks: Track[];
  selection: Set<string>;
  selectionKey: (track: Track, index: number) => string;
  setSelection: (panelId: string, trackIds: string[]) => void;
  panelId: string;
  setFocusedIndex: (index: number | null) => void;
  lastFocusedIndexRef: MutableRefObject<number | null>;
}) {
  const tracks = filteredTracks.map((t: Track, i: number) => selectionKey(t, i));
  const anchorIndex = lastFocusedIndexRef.current ?? tracks.findIndex((id: string) => selection.has(id));

  if (anchorIndex === -1 || index === -1) {
    return;
  }

  const start = Math.min(index, anchorIndex);
  const end = Math.max(index, anchorIndex);
  setSelection(panelId, tracks.slice(start, end + 1));
  setFocusedIndex(index);
}

export function useTrackListSelection({
  filteredTracks,
  selection,
  panelId,
  setSelection,
  toggleSelection,
  virtualizer,
  selectionKey,
  onDeleteKeyPress,
  canDelete = false,
  isCompact = false,
}: Params) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const lastFocusedIndexRef = useRef<number | null>(null);

  const handleTrackClick = useCallback(
    (selectionId: string, index: number) => {
      virtualizer.scrollElement?.focus({ preventScroll: true });
      setSelection(panelId, [selectionId]);
      setFocusedIndex(index);
      lastFocusedIndexRef.current = index;
    },
    [panelId, setSelection, virtualizer]
  );

  const handleTrackSelect = useCallback(
    (selectionId: string, index: number, event: any) => {
      virtualizer.scrollElement?.focus({ preventScroll: true });

      if (event.shiftKey) {
        applyShiftSelection({
          index,
          filteredTracks,
          selection,
          selectionKey,
          setSelection,
          panelId,
          setFocusedIndex,
          lastFocusedIndexRef,
        });
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        toggleSelection(panelId, selectionId);
        setFocusedIndexState(index, setFocusedIndex, lastFocusedIndexRef);
        return;
      }

      setSelection(panelId, [selectionId]);
      setFocusedIndexState(index, setFocusedIndex, lastFocusedIndexRef);
    },
    [filteredTracks, panelId, selection, setSelection, toggleSelection, virtualizer, selectionKey]
  );

  const handleKeyDownNavigation = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        tryHandleDeleteKey({
          event,
          canDelete,
          selection,
          onDeleteKeyPress,
          filteredTracks,
          selectionKey,
        })
      ) {
        return;
      }

      const direction = getArrowDirection(event.key);
      if (direction === null) {
        return;
      }

      if (!filteredTracks.length) {
        return;
      }

      event.preventDefault();
      const baseIndex =
        focusedIndex ?? filteredTracks.findIndex((track, i) => selection.has(selectionKey(track, i)));

      const nextIndex = getNextTrackIndex(filteredTracks, selection, direction, baseIndex);

      if (nextIndex === -1) {
        return;
      }

      const nextTrack = filteredTracks[nextIndex];
      if (!nextTrack) {
        return;
      }
      const nextSelectionId = selectionKey(nextTrack, nextIndex);

      const headerOffset = isCompact ? TABLE_HEADER_HEIGHT_COMPACT : TABLE_HEADER_HEIGHT;
      const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;
      scrollToIndexIfOutOfView(virtualizer, nextIndex, headerOffset, rowHeight);

      if (event.shiftKey) {
        applyKeyboardRangeSelection({
          nextIndex,
          filteredTracks,
          selection,
          selectionKey,
          panelId,
          setSelection,
          setFocusedIndex,
          lastFocusedIndexRef,
        });
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        setFocusedIndex(nextIndex);
        lastFocusedIndexRef.current = nextIndex;
        return;
      }

      setSelection(panelId, [nextSelectionId]);
      setFocusedIndex(nextIndex);
      lastFocusedIndexRef.current = nextIndex;
    },
    [filteredTracks, focusedIndex, panelId, selection, setSelection, virtualizer, selectionKey, canDelete, onDeleteKeyPress, isCompact]
  );

  return {
    handleTrackClick,
    handleTrackSelect,
    handleKeyDownNavigation,
    focusedIndex,
    setFocusedIndex,
  };
}
