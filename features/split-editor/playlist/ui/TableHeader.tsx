/**
 * TableHeader component for playlist tables with sortable columns.
 * Sticky header that remains visible during scroll.
 */

'use client';

import { ArrowUp, ArrowDown, Heart, Play, Plus, TrendingUp, Calendar, Users, Timer, Radio, GripVertical } from 'lucide-react';
import { useCompactModeStore } from '@features/split-editor/stores/useCompactModeStore';
import { useDragHandle } from '@/components/split-editor/mobile/DragHandle';
import type { SortKey, SortDirection } from '@features/split-editor/playlist/hooks/usePlaylistSort';
import type { LucideIcon } from 'lucide-react';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { supportsProviderPlaybackControl } from '@/lib/music-provider/capabilities';
import { DEFAULT_MUSIC_PROVIDER_ID } from '@/lib/music-provider/providerId';

interface TableHeaderProps {
  isEditable: boolean;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  /** Whether to show the liked status column */
  showLikedColumn?: boolean;
  /** Whether this is a collaborative playlist (shows added-by column) */
  isCollaborative?: boolean;
  /** Whether to show the match status column (for Last.fm import) */
  showMatchStatusColumn?: boolean;
  /** Whether to show the custom add column (for Last.fm import) */
  showCustomAddColumn?: boolean;
  /** Whether to show wider date column for scrobble timestamps */
  showScrobbleDateColumn?: boolean;
  /** Whether to show cumulative time column (default true) */
  showCumulativeTime?: boolean;
  /** Whether to show release year/date column (default true) */
  showReleaseYearColumn?: boolean;
  /** Whether to show popularity column (default true) */
  showPopularityColumn?: boolean;
  /** Provider for playback-capable columns */
  providerId?: MusicProviderId;
}

/** Grid template for consistent column alignment between header and rows */
export const TRACK_GRID_CLASSES = 'grid items-center content-center';
export const TRACK_GRID_CLASSES_NORMAL = 'gap-2 px-2';
export const TRACK_GRID_CLASSES_COMPACT = 'gap-1 px-1';

export interface TrackGridOptions {
  showPlayColumn?: boolean;
  showAddToMarkedColumn?: boolean;
  showContributorColumn?: boolean;
  /** Show match status indicator column (for Last.fm import) */
  showMatchStatusColumn?: boolean;
  /** Show custom add button column (for Last.fm import - replaces standard add to marked) */
  showCustomAddColumn?: boolean;
  /** Show wider date column for scrobble timestamps instead of year */
  showScrobbleDateColumn?: boolean;
  /** Show cumulative time column (default true) */
  showCumulativeTime?: boolean;
  /** Show drag handle column (for touch devices) */
  showDragHandle?: boolean;
  /** Show release year/date column (default true) */
  showReleaseYearColumn?: boolean;
  /** Show popularity column (default true) */
  showPopularityColumn?: boolean;
}

function getOptionalPrefixColumns(
  showPlayColumn: boolean,
  showAddToMarkedColumn: boolean,
  showContributorColumn: boolean,
  options?: Pick<TrackGridOptions, 'showMatchStatusColumn' | 'showCustomAddColumn' | 'showDragHandle'>,
): string[] {
  const optionalColumns: Array<[boolean, string]> = [
    [Boolean(options?.showDragHandle), '44px'],
    [Boolean(options?.showMatchStatusColumn), '20px'],
    [Boolean(options?.showCustomAddColumn), '20px'],
    [showContributorColumn, '20px'],
    [showPlayColumn, '20px'],
    [showAddToMarkedColumn, '20px'],
  ];

  return optionalColumns.filter(([isVisible]) => isVisible).map(([, width]) => width);
}

function getOptionalSuffixColumns(
  options?: Pick<TrackGridOptions, 'showScrobbleDateColumn' | 'showCumulativeTime' | 'showReleaseYearColumn' | 'showPopularityColumn'>,
): string[] {
  const dateColumn = options?.showScrobbleDateColumn ? '90px' : '36px';
  const showReleaseYearColumn = options?.showReleaseYearColumn !== false;
  const showPopularityColumn = options?.showPopularityColumn !== false;

  return [
    ...(showReleaseYearColumn ? [dateColumn] : []),
    ...(showPopularityColumn ? ['36px'] : []),
    '44px',
    ...(options?.showCumulativeTime === false ? [] : ['52px']),
  ];
}

/**
 * Generates dynamic grid template columns based on which columns are visible.
 * 
 * @param showPlayColumn - Whether to show play button column
 * @param showAddToMarkedColumn - Whether to show add-to-marked button column
 * @param showContributorColumn - Whether to show contributor avatar column
 * @param options - Additional column options
 * @param _isMobile - Whether to use simplified mobile layout (fewer columns)
 */
export function getTrackGridStyle(
  showPlayColumn: boolean,
  showAddToMarkedColumn: boolean,
  showContributorColumn: boolean = false,
  options?: Pick<TrackGridOptions, 'showMatchStatusColumn' | 'showCustomAddColumn' | 'showScrobbleDateColumn' | 'showCumulativeTime' | 'showDragHandle' | 'showReleaseYearColumn' | 'showPopularityColumn'>,
  _isMobile: boolean = false // Unused - always use same layout
) {
  const prefixColumns = getOptionalPrefixColumns(showPlayColumn, showAddToMarkedColumn, showContributorColumn, options);
  const suffixColumns = getOptionalSuffixColumns(options);

  const columns = [
    ...prefixColumns,
    '20px',
    '28px',
    'minmax(100px, 3fr)',
    'minmax(60px, 1.5fr)',
    'minmax(60px, 1fr)',
    ...suffixColumns,
  ];

  return { gridTemplateColumns: columns.join(' ') };
}

interface PrefixIconColumn {
  key: string;
  title: string;
  icon: LucideIcon;
}

function getPrefixIconColumns({
  showDragHandle,
  showMatchStatusColumn,
  showCustomAddColumn,
  isCollaborative,
  showPlayButton,
  showStandardAddColumn,
}: {
  showDragHandle: boolean;
  showMatchStatusColumn: boolean;
  showCustomAddColumn: boolean;
  isCollaborative: boolean;
  showPlayButton: boolean;
  showStandardAddColumn: boolean;
}): PrefixIconColumn[] {
  const columns: Array<{ isVisible: boolean; column: PrefixIconColumn }> = [
    {
      isVisible: showDragHandle,
      column: { key: 'drag-handle', title: 'Drag handle', icon: GripVertical },
    },
    {
      isVisible: showMatchStatusColumn,
      column: { key: 'match-status', title: 'Match status', icon: Radio },
    },
    {
      isVisible: showCustomAddColumn,
      column: { key: 'custom-add', title: 'Add to marked insertion points', icon: Plus },
    },
    {
      isVisible: isCollaborative,
      column: { key: 'contributor', title: 'Added by', icon: Users },
    },
    {
      isVisible: showPlayButton,
      column: { key: 'play', title: 'Play', icon: Play },
    },
    {
      isVisible: showStandardAddColumn,
      column: { key: 'add', title: 'Add to marked insertion points', icon: Plus },
    },
  ];

  return columns.filter((entry) => entry.isVisible).map((entry) => entry.column);
}

function HeaderIconCell({
  icon: Icon,
  title,
  iconClass,
}: {
  icon: LucideIcon;
  title: string;
  iconClass: string;
}) {
  return (
    <div className="flex items-center justify-center" title={title}>
      <Icon className={iconClass} />
    </div>
  );
}

function SortableLabelButton({
  label,
  keyName,
  sortKey,
  sortDirection,
  onSort,
  isCompact,
  align = 'left',
}: {
  label: string;
  keyName: SortKey;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  isCompact: boolean;
  align?: 'left' | 'right';
}) {
  const isActive = sortKey === keyName;
  const SortIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      onClick={() => onSort(keyName)}
      className={[
        'flex items-center gap-1 w-full h-full font-medium uppercase tracking-wide hover:text-foreground transition-colors',
        isActive ? 'text-foreground' : 'text-muted-foreground',
        align === 'right' ? 'justify-end' : '',
        isCompact ? 'text-[10px]' : 'text-xs',
      ].join(' ')}
      title={`Sort by ${label}`}
    >
      <span className="truncate">{label}</span>
      {isActive ? (
        <SortIcon className={isCompact ? 'h-2.5 w-2.5 flex-shrink-0' : 'h-3 w-3 flex-shrink-0'} />
      ) : null}
    </button>
  );
}

function SortableIconButton({
  icon: Icon,
  keyName,
  sortKey,
  sortDirection,
  onSort,
  isCompact,
  title,
}: {
  icon: LucideIcon;
  keyName: SortKey;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  isCompact: boolean;
  title: string;
}) {
  const isActive = sortKey === keyName;
  const SortIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className="flex items-center justify-center" title={title}>
      <button
        onClick={() => onSort(keyName)}
        className={`flex items-center gap-0.5 transition-colors hover:text-foreground ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        <Icon className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        {isActive ? <SortIcon className={isCompact ? 'h-2 w-2' : 'h-2.5 w-2.5'} /> : null}
      </button>
    </div>
  );
}

function LikedStatusHeader({ showLikedColumn, iconClass }: { showLikedColumn: boolean; iconClass: string }) {
  if (!showLikedColumn) {
    return <div />;
  }

  return (
    <div className="flex items-center justify-center" title="Liked status">
      <Heart className={iconClass} />
    </div>
  );
}

function CumulativeTimeHeader({ showCumulativeTime, iconClass }: { showCumulativeTime: boolean; iconClass: string }) {
  if (!showCumulativeTime) {
    return null;
  }

  return (
    <div className="flex items-center justify-end" title="Cumulative time from start">
      <Timer className={iconClass} />
    </div>
  );
}

type TableHeaderContentProps = {
  iconClass: string;
  isCompact: boolean;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  showLikedColumn: boolean;
  showReleaseYearColumn: boolean;
  showPopularityColumn: boolean;
  showCumulativeTime: boolean;
  prefixIconColumns: PrefixIconColumn[];
  gridStyle: { gridTemplateColumns: string };
};

function TableHeaderContent({
  iconClass,
  isCompact,
  sortKey,
  sortDirection,
  onSort,
  showLikedColumn,
  showReleaseYearColumn,
  showPopularityColumn,
  showCumulativeTime,
  prefixIconColumns,
  gridStyle,
}: TableHeaderContentProps) {
  return (
    <div
      data-table-header="true"
      className={`sticky top-0 z-20 border-b border-border bg-card backdrop-blur-sm text-muted-foreground ${TRACK_GRID_CLASSES} ${isCompact ? 'h-8 ' + TRACK_GRID_CLASSES_COMPACT : 'h-10 ' + TRACK_GRID_CLASSES_NORMAL}`}
      style={gridStyle}
    >
      {prefixIconColumns.map((column) => (
        <HeaderIconCell key={column.key} icon={column.icon} title={column.title} iconClass={iconClass} />
      ))}

      <LikedStatusHeader showLikedColumn={showLikedColumn} iconClass={iconClass} />

      <div>
        <SortableLabelButton
          label="#"
          keyName="position"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
          isCompact={isCompact}
        />
      </div>

      <div>
        <SortableLabelButton
          label="Title"
          keyName="name"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
          isCompact={isCompact}
        />
      </div>

      <div>
        <SortableLabelButton
          label="Artist"
          keyName="artist"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
          isCompact={isCompact}
        />
      </div>

      <div>
        <SortableLabelButton
          label="Album"
          keyName="album"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
          isCompact={isCompact}
        />
      </div>

      {showReleaseYearColumn && (
        <SortableIconButton
          icon={Calendar}
          keyName="year"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
          isCompact={isCompact}
          title="Release Year"
        />
      )}

      {showPopularityColumn && (
        <SortableIconButton
          icon={TrendingUp}
          keyName="popularity"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
          isCompact={isCompact}
          title="Popularity"
        />
      )}

      <div className="text-right">
        <SortableLabelButton
          label="Time"
          keyName="duration"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
          isCompact={isCompact}
          align="right"
        />
      </div>

      <CumulativeTimeHeader showCumulativeTime={showCumulativeTime} iconClass={iconClass} />
    </div>
  );
}

export function TableHeader({ 
  isEditable: _isEditable, 
  sortKey, 
  sortDirection, 
  onSort, 
  showLikedColumn = true, 
  isCollaborative = false,
  showMatchStatusColumn = false,
  showCustomAddColumn = false,
  showScrobbleDateColumn = false,
  showCumulativeTime = true,
  showReleaseYearColumn = true,
  showPopularityColumn = true,
  providerId = DEFAULT_MUSIC_PROVIDER_ID,
}: TableHeaderProps) {
  const { isCompact } = useCompactModeStore();
  const iconClass = isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3';
  const showPlayButton = supportsProviderPlaybackControl(providerId);
  
  
  // Mobile drag handle visibility (matches TrackRow)
  const { showHandle: showDragHandle } = useDragHandle();
  
  // Always show standard add column (unless using custom add column for Last.fm)
  const showStandardAddColumn = !showCustomAddColumn;

  const prefixIconColumns = getPrefixIconColumns({
    showDragHandle,
    showMatchStatusColumn,
    showCustomAddColumn,
    isCollaborative,
    showPlayButton,
    showStandardAddColumn,
  });
  
  // Dynamic grid style based on visible columns
  const gridStyle = getTrackGridStyle(
    showPlayButton, 
    showStandardAddColumn, 
    isCollaborative, 
    {
      showMatchStatusColumn,
      showCustomAddColumn,
      showScrobbleDateColumn,
      showCumulativeTime,
      showDragHandle,
      showReleaseYearColumn,
      showPopularityColumn,
    }
  );

  return (
    <TableHeaderContent
      iconClass={iconClass}
      isCompact={isCompact}
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={onSort}
      showLikedColumn={showLikedColumn}
      showReleaseYearColumn={showReleaseYearColumn}
      showPopularityColumn={showPopularityColumn}
      showCumulativeTime={showCumulativeTime}
      prefixIconColumns={prefixIconColumns}
      gridStyle={gridStyle}
    />
  );
}
