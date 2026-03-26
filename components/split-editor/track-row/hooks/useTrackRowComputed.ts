import { useMemo } from 'react';
import { getTrackGridStyle } from '@features/split-editor/playlist/ui/TableHeader';
import type { Track, MusicProviderId } from '@/lib/music-provider/types';

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
  showReleaseYearColumn: boolean;
  showPopularityColumn: boolean;
  showCumulativeTime: boolean;
  showHandle: boolean;
  isCompact: boolean;
  providerId: MusicProviderId;
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
  showReleaseYearColumn,
  showPopularityColumn,
  showCumulativeTime,
  showHandle,
  isCompact,
  providerId,
  isCollaborative,
  getProfile,
}: UseTrackRowComputedInput) {
  const shouldShowPlayButton = providerId === 'spotify';
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
        showReleaseYearColumn,
        showPopularityColumn,
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
      showReleaseYearColumn,
      showPopularityColumn,
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
