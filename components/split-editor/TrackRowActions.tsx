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

export function PlayPauseButton({ 
  isCompact, 
  isPlaying, 
  isLoading, 
  isLocalFile, 
  isPlayingFromThisPanel = true,
  onClick 
}: PlayPauseButtonProps) {
  // Show hollow circle if playing but not from this panel
  const showHollowCircle = isPlaying && !isPlayingFromThisPanel;
  
  return (
    <button
      onClick={onClick}
      disabled={isLocalFile || isLoading}
      className={cn(
        'flex items-center justify-center rounded-full transition-all',
        isCompact ? 'h-5 w-5' : 'h-6 w-6',
        isLocalFile && 'opacity-30 cursor-not-allowed',
        !isLocalFile && 'hover:scale-110 hover:bg-green-500 hover:text-white',
        showHollowCircle 
          ? 'border-2 border-green-500 text-green-500'
          : isPlaying 
            ? 'bg-green-500 text-white' 
            : 'text-muted-foreground',
      )}
      title={
        isLocalFile
          ? 'Local files cannot be played'
          : showHollowCircle
            ? 'Playing from another playlist or device'
            : isPlaying
              ? 'Pause'
              : 'Play'
      }
      aria-label={isPlaying ? 'Pause track' : 'Play track'}
    >
      {isLoading ? (
        <Loader2 className={isCompact ? 'h-3 w-3 animate-spin' : 'h-4 w-4 animate-spin'} />
      ) : showHollowCircle ? (
        // Play triangle with hollow circle border for playing from another source
        <Play className={isCompact ? 'h-3 w-3 ml-0.5' : 'h-4 w-4 ml-0.5'} />
      ) : isPlaying ? (
        <Pause className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
      ) : (
        <Play className={isCompact ? 'h-3 w-3 ml-0.5' : 'h-4 w-4 ml-0.5'} />
      )}
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
        // Position at top or bottom based on edge
        edge === 'bottom'
          ? (isCompact ? '-bottom-2' : '-bottom-2.5')
          : (isCompact ? '-top-2' : '-top-2.5'),
        // Show as active if there's a marker at the relevant position
        hasMarker
          ? 'bg-orange-500 text-white hover:bg-orange-600'
          : 'bg-muted text-muted-foreground hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-950',
      )}
      title={
        edge === 'bottom'
          ? (hasMarker ? 'Remove insertion marker' : 'Add insertion marker after this row')
          : (hasMarker ? 'Remove insertion marker' : 'Add insertion marker before this row')
      }
      aria-pressed={hasMarker}
      aria-label={
        edge === 'bottom'
          ? (hasMarker ? `Remove insertion point after row ${rowIndex + 1}` : `Add insertion point after row ${rowIndex + 1}`)
          : (hasMarker ? `Remove insertion point before row ${rowIndex + 1}` : `Add insertion point before row ${rowIndex + 1}`)
      }
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
