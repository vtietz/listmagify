/**
 * LoadingSkeletonList - Renders skeleton placeholders for loading track list.
 *
 * Displays a grid-aligned skeleton layout consistent with TrackRow columns.
 */

'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { SKELETON_GRID_TEMPLATE, DEFAULT_SKELETON_ROW_COUNT } from './types';

interface LoadingSkeletonListProps {
  /** Number of skeleton rows to display */
  rowCount?: number;
}

export function LoadingSkeletonList({
  rowCount = DEFAULT_SKELETON_ROW_COUNT,
}: LoadingSkeletonListProps) {
  return (
    <div className="p-2 space-y-1">
      {Array.from({ length: rowCount }).map((_, i) => (
        <div
          key={i}
          className="grid items-center gap-2 px-2 py-1"
          style={{ gridTemplateColumns: SKELETON_GRID_TEMPLATE }}
        >
          {/* Heart */}
          <Skeleton className="h-4 w-4 rounded" />
          {/* Play/Add */}
          <Skeleton className="h-4 w-4 rounded" />
          {/* Position */}
          <Skeleton className="h-3 w-6" />
          {/* Title */}
          <Skeleton className="h-4 w-full" />
          {/* Artist */}
          <Skeleton className="h-3 w-3/4" />
          {/* Album */}
          <Skeleton className="h-3 w-2/3" />
          {/* Date */}
          <Skeleton className="h-3 w-8" />
          {/* Popularity */}
          <Skeleton className="h-2 w-full rounded-full" />
          {/* Duration */}
          <Skeleton className="h-3 w-10" />
          {/* Cumulative */}
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}
