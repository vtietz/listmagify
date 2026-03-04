import { useMemo } from 'react';
import { getTrackGridStyle } from '../../TableHeader';
import type { Track } from '@/lib/spotify/types';

interface UseTrackRowComputedInput {
  track: Track;
  index: number;
  isSelected: boolean;
  isDuplicate: boolean;
  isSoftDuplicate: boolean;
  compareColor: string | undefined;
  showCustomAddColumn: boolean;
  showMatchStatusColumn: boolean;
  showScrobbleDateColumn: boolean;
  showCumulativeTime: boolean;
  showHandle: boolean;
  isCompact: boolean;
  isCollaborative: boolean;
  getProfile?: ((userId: string) => { displayName?: string | null; imageUrl?: string | null } | undefined) | undefined;
}

export function useTrackRowComputed({
  track,
  index,
  isSelected,
  isDuplicate,
  isSoftDuplicate,
  compareColor,
  showCustomAddColumn,
  showMatchStatusColumn,
  showScrobbleDateColumn,
  showCumulativeTime,
  showHandle,
  isCompact,
  isCollaborative,
  getProfile,
}: UseTrackRowComputedInput) {
  const shouldShowPlayButton = true;
  const showStandardAddColumn = !showCustomAddColumn;
  const isLocalFile = track.id === null;
  const isAnyDuplicate = isDuplicate || isSoftDuplicate;
  const trackPosition = track.position ?? index;

  const gridStyle = useMemo(
    () =>
      getTrackGridStyle(shouldShowPlayButton, showStandardAddColumn, isCollaborative, {
        showMatchStatusColumn,
        showCustomAddColumn,
        showScrobbleDateColumn,
        showCumulativeTime,
        showDragHandle: showHandle,
      }),
    [
      shouldShowPlayButton,
      showStandardAddColumn,
      isCollaborative,
      showMatchStatusColumn,
      showCustomAddColumn,
      showScrobbleDateColumn,
      showCumulativeTime,
      showHandle,
    ],
  );

  const effectiveBackgroundStyle = useMemo(() => {
    if (compareColor && compareColor !== 'transparent' && !isSelected && !isAnyDuplicate) {
      return { backgroundColor: compareColor };
    }
    return {};
  }, [compareColor, isSelected, isAnyDuplicate]);

  const contributorProfile = useMemo(() => {
    if (!isCollaborative || !track.addedBy) return null;
    const profile = getProfile?.(track.addedBy.id);
    return {
      userId: track.addedBy.id,
      displayName: profile?.displayName ?? track.addedBy.displayName ?? null,
      imageUrl: profile?.imageUrl ?? null,
    };
  }, [isCollaborative, track.addedBy, getProfile]);

  return {
    shouldShowPlayButton,
    showStandardAddColumn,
    isLocalFile,
    isAnyDuplicate,
    trackPosition,
    isCompact,
    gridStyle,
    effectiveBackgroundStyle,
    contributorProfile,
  };
}
