import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { Track } from '@/lib/spotify/types';
import { getNextTrackIndex } from '@/lib/dnd/selection';
import { scrollToIndexIfOutOfView } from '@/lib/utils/virtualScroll';
import { TABLE_HEADER_HEIGHT, TRACK_ROW_HEIGHT } from '@/components/split/constants';

interface Params {
  filteredTracks: Track[];
  selection: Set<string>;
  panelId: string;
  setSelection: (panelId: string, trackIds: string[]) => void;
  toggleSelection: (panelId: string, trackId: string) => void;
  virtualizer: Virtualizer<any, any>;
}

export function useTrackListSelection({
  filteredTracks,
  selection,
  panelId,
  setSelection,
  toggleSelection,
  virtualizer,
}: Params) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const lastFocusedIndexRef = useRef<number | null>(null);

  const handleTrackClick = useCallback(
    (trackId: string, index: number) => {
      virtualizer.scrollElement?.focus();
      setSelection(panelId, [trackId]);
      setFocusedIndex(index);
      lastFocusedIndexRef.current = index;
    },
    [panelId, setSelection, virtualizer]
  );

  const handleTrackSelect = useCallback(
    (trackId: string, index: number, event: any) => {
      virtualizer.scrollElement?.focus();

      if (event.shiftKey) {
        const tracks = filteredTracks.map((t: Track) => t.id || t.uri);
        const currentIndex = index;
        const anchorIndex =
          lastFocusedIndexRef.current ?? tracks.findIndex((id: string) => selection.has(id));

        if (anchorIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(currentIndex, anchorIndex);
          const end = Math.max(currentIndex, anchorIndex);
          const range = tracks.slice(start, end + 1);
          setSelection(panelId, range);
          setFocusedIndex(currentIndex);
        }
      } else if (event.ctrlKey || event.metaKey) {
        toggleSelection(panelId, trackId);
        setFocusedIndex(index);
        lastFocusedIndexRef.current = index;
      } else {
        setSelection(panelId, [trackId]);
        setFocusedIndex(index);
        lastFocusedIndexRef.current = index;
      }
    },
    [filteredTracks, panelId, selection, setSelection, toggleSelection, virtualizer]
  );

  const handleKeyDownNavigation = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return;
      }

      if (!filteredTracks.length) {
        return;
      }

      event.preventDefault();

      const direction: 1 | -1 = event.key === 'ArrowDown' ? 1 : -1;
      const baseIndex =
        focusedIndex ?? filteredTracks.findIndex((track) => selection.has(track.id || track.uri));

      const nextIndex = getNextTrackIndex(filteredTracks, selection, direction, baseIndex);

      if (nextIndex === -1) {
        return;
      }

      const nextTrack = filteredTracks[nextIndex];
      if (!nextTrack) {
        return;
      }
      const nextTrackId = nextTrack.id || nextTrack.uri;
      if (!nextTrackId) {
        return;
      }

      scrollToIndexIfOutOfView(virtualizer, nextIndex, TABLE_HEADER_HEIGHT, TRACK_ROW_HEIGHT);

      if (event.shiftKey) {
        let anchorIndex = lastFocusedIndexRef.current;

        // If no anchor, try to establish one from current selection or cursor
        if (anchorIndex === null) {
          const firstSelected = filteredTracks.findIndex((track) => selection.has(track.id || track.uri));
          anchorIndex = firstSelected !== -1 ? firstSelected : nextIndex;
          lastFocusedIndexRef.current = anchorIndex;
        }

        const start = Math.min(anchorIndex, nextIndex);
        const end = Math.max(anchorIndex, nextIndex);
        const tracks = filteredTracks.slice(start, end + 1).map((t) => t.id || t.uri);
        setSelection(panelId, tracks);
        setFocusedIndex(nextIndex);
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        setFocusedIndex(nextIndex);
        lastFocusedIndexRef.current = nextIndex;
        return;
      }

      setSelection(panelId, [nextTrackId]);
      setFocusedIndex(nextIndex);
      lastFocusedIndexRef.current = nextIndex;
    },
    [filteredTracks, focusedIndex, panelId, selection, setSelection, virtualizer]
  );

  return {
    handleTrackClick,
    handleTrackSelect,
    handleKeyDownNavigation,
    focusedIndex,
    setFocusedIndex,
  };
}
