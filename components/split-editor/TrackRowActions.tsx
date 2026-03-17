/**
 * Extracted action button subcomponents for TrackRow.
 * Each component renders an interactive button in the track grid.
 */

'use client';

import * as React from 'react';
import { Heart, Play, Pause, Loader2, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';

// ============================================================================
// Heart (Like) Button
// ============================================================================

interface HeartButtonProps {
  isCompact: boolean;
  /** Whether this track is liked (saved to user's library) */
  isLiked: boolean;
  /** Whether this is a local file (can't be liked) */
  isLocalFile: boolean;
  /** Callback to toggle liked status */
  onClick: (e: React.MouseEvent) => void;
}

export function HeartButton({ isCompact, isLiked, isLocalFile, onClick }: HeartButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLocalFile}
      className={cn(
        'flex items-center justify-center transition-colors',
        isLocalFile && 'opacity-30 cursor-not-allowed',
        !isLocalFile && 'hover:scale-110',
        isLiked ? 'text-[#9759f5]' : 'text-muted-foreground hover:text-foreground',
      )}
      title={
        isLocalFile
          ? 'Local files cannot be saved to library'
          : isLiked
            ? 'Remove from Liked Songs'
            : 'Save to Liked Songs'
      }
      aria-label={isLiked ? 'Unlike track' : 'Like track'}
    >
      <Heart
        className={cn(isCompact ? 'h-3 w-3' : 'h-4 w-4', isLiked && 'fill-current')}
      />
    </button>
  );
}

// ============================================================================
// Play/Pause Button
// ============================================================================

interface PlayPauseButtonProps {
  isCompact: boolean;
  /** Whether this track is currently playing */
  isPlaying: boolean;
  /** Whether playback is loading for this track */
  isLoading: boolean;
  /** Whether this is a local file (can't be played) */
  isLocalFile: boolean;
  /** Whether this track is playing from this specific panel (true) or from another source (false) */
  isPlayingFromThisPanel?: boolean;
  /** Callback to toggle playback */
  onClick: (e: React.MouseEvent) => void;
}

type PlayPauseVisualState = 'loading' | 'remote-playing' | 'playing' | 'idle';

function getPlayPauseVisualState(
  isLoading: boolean,
  isPlaying: boolean,
  isPlayingFromThisPanel: boolean,
): PlayPauseVisualState {
  if (isLoading) {
    return 'loading';
  }

  if (isPlaying && !isPlayingFromThisPanel) {
    return 'remote-playing';
  }

  if (isPlaying) {
    return 'playing';
  }

  return 'idle';
}

function buildPlayPauseClassName(
  isCompact: boolean,
  isLocalFile: boolean,
  state: PlayPauseVisualState,
): string {
  return cn(
    'flex items-center justify-center rounded-full transition-all',
    isCompact ? 'h-5 w-5' : 'h-6 w-6',
    isLocalFile && 'opacity-30 cursor-not-allowed',
    !isLocalFile && 'hover:scale-110 hover:bg-green-500 hover:text-white',
    state === 'remote-playing'
      ? 'border-2 border-green-500 text-green-500'
      : state === 'playing'
        ? 'bg-green-500 text-white'
        : 'text-muted-foreground',
  );
}

function buildPlayPauseTitle(isLocalFile: boolean, state: PlayPauseVisualState): string {
  if (isLocalFile) {
    return 'Local files cannot be played';
  }

  if (state === 'remote-playing') {
    return 'Playing from another playlist or device';
  }

  if (state === 'playing') {
    return 'Pause';
  }

  return 'Play';
}

function buildPlayPauseAriaLabel(state: PlayPauseVisualState): string {
  return state === 'playing' || state === 'remote-playing' ? 'Pause track' : 'Play track';
}

function PlayPauseIcon({
  state,
  isCompact,
}: {
  state: PlayPauseVisualState;
  isCompact: boolean;
}): React.ReactNode {
  if (state === 'loading') {
    return <Loader2 className={isCompact ? 'h-3 w-3 animate-spin' : 'h-4 w-4 animate-spin'} />;
  }

  if (state === 'playing') {
    return <Pause className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />;
  }

  return <Play className={isCompact ? 'h-3 w-3 ml-0.5' : 'h-4 w-4 ml-0.5'} />;
}

export function PlayPauseButton({ 
  isCompact, 
  isPlaying, 
  isLoading, 
  isLocalFile, 
  isPlayingFromThisPanel = true,
  onClick 
}: PlayPauseButtonProps) {
  const state = getPlayPauseVisualState(isLoading, isPlaying, isPlayingFromThisPanel);
  
  return (
    <button
      onClick={onClick}
      disabled={isLocalFile || isLoading}
      className={buildPlayPauseClassName(isCompact, isLocalFile, state)}
      title={buildPlayPauseTitle(isLocalFile, state)}
      aria-label={buildPlayPauseAriaLabel(state)}
    >
      <PlayPauseIcon state={state} isCompact={isCompact} />
    </button>
  );
}

// ============================================================================
// Insertion Marker Toggle Button
// ============================================================================

interface InsertionToggleButtonProps {
  isCompact: boolean;
  /** Which edge the button appears at */
  edge: 'top' | 'bottom';
  /** Whether there's currently a marker at this position */
  hasMarker: boolean;
  /** Row index for aria labels */
  rowIndex: number;
  /** Callback to toggle marker */
  onClick: (e: React.MouseEvent) => void;
}

function buildInsertionEdgeClassName(edge: 'top' | 'bottom', isCompact: boolean): string {
  if (edge === 'bottom') {
    return isCompact ? '-bottom-2' : '-bottom-2.5';
  }

  return isCompact ? '-top-2' : '-top-2.5';
}

function buildInsertionToggleTitle(edge: 'top' | 'bottom', hasMarker: boolean): string {
  if (hasMarker) {
    return 'Remove insertion marker';
  }

  return edge === 'bottom' ? 'Add insertion marker after this row' : 'Add insertion marker before this row';
}

function buildInsertionToggleAriaLabel(edge: 'top' | 'bottom', hasMarker: boolean, rowIndex: number): string {
  const rowNumber = rowIndex + 1;
  if (edge === 'bottom') {
    return hasMarker
      ? `Remove insertion point after row ${rowNumber}`
      : `Add insertion point after row ${rowNumber}`;
  }

  return hasMarker
    ? `Remove insertion point before row ${rowNumber}`
    : `Add insertion point before row ${rowNumber}`;
}

function buildInsertionToggleStateClass(hasMarker: boolean): string {
  if (hasMarker) {
    return 'bg-orange-500 text-white hover:bg-orange-600';
  }

  return 'bg-muted text-muted-foreground hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-950';
}

export function InsertionToggleButton({ 
  isCompact, 
  edge, 
  hasMarker, 
  rowIndex, 
  onClick 
}: InsertionToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'absolute z-20 rounded-full transition-all duration-150',
        'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1',
        isCompact ? 'w-4 h-4 -left-1' : 'w-5 h-5 -left-1.5',
        buildInsertionEdgeClassName(edge, isCompact),
        buildInsertionToggleStateClass(hasMarker),
      )}
      title={buildInsertionToggleTitle(edge, hasMarker)}
      aria-pressed={hasMarker}
      aria-label={buildInsertionToggleAriaLabel(edge, hasMarker, rowIndex)}
    >
      <MapPin className={cn(isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3', 'mx-auto')} />
    </button>
  );
}

// ============================================================================
// Contributor Avatar
// ============================================================================

interface ContributorAvatarProps {
  isCompact: boolean;
  /** User ID who added the track */
  userId?: string | undefined;
  /** Display name of the user */
  displayName?: string | null | undefined;
  /** URL of the user's profile image */
  imageUrl?: string | null | undefined;
}

export function ContributorAvatar({ isCompact, userId, displayName, imageUrl }: ContributorAvatarProps) {
  if (!userId) {
    return (
      <div className="flex items-center justify-center">
        <div
          className={cn(
            'rounded-full bg-muted/30',
            isCompact ? 'h-4 w-4' : 'h-5 w-5'
          )}
          title="Unknown contributor"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center">
      <Avatar
        displayName={displayName ?? null}
        userId={userId}
        imageUrl={imageUrl ?? null}
        size={isCompact ? 'sm' : 'md'}
        title={`Added by ${displayName || userId}`}
      />
    </div>
  );
}
