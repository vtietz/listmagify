/**
 * PlayingIndicator - Animated bars indicating active playback
 * Similar to Spotify's playing animation
 */

'use client';

import { cn } from '@/lib/utils';

interface PlayingIndicatorProps {
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

export function PlayingIndicator({ className, size = 'md' }: PlayingIndicatorProps) {
  const sizeClasses = {
    sm: 'h-2.5 w-2',
    md: 'h-3.5 w-2.5',
    lg: 'h-5 w-3.5',
  };

  const barHeights = {
    sm: ['h-1', 'h-1.5', 'h-1', 'h-2'],
    md: ['h-1.5', 'h-2.5', 'h-1.5', 'h-3'],
    lg: ['h-2', 'h-3', 'h-2', 'h-4'],
  };

  return (
    <div 
      className={cn(
        'inline-flex items-end gap-0.5',
        sizeClasses[size],
        className
      )}
      aria-label="Playing"
    >
      <span 
        className={cn(
          'w-0.5 bg-green-500 rounded-full animate-playing-bar-1',
          barHeights[size][0]
        )}
        style={{
          animationDelay: '0ms',
        }}
      />
      <span 
        className={cn(
          'w-0.5 bg-green-500 rounded-full animate-playing-bar-2',
          barHeights[size][1]
        )}
        style={{
          animationDelay: '150ms',
        }}
      />
      <span 
        className={cn(
          'w-0.5 bg-green-500 rounded-full animate-playing-bar-3',
          barHeights[size][2]
        )}
        style={{
          animationDelay: '300ms',
        }}
      />
      <span 
        className={cn(
          'w-0.5 bg-green-500 rounded-full animate-playing-bar-4',
          barHeights[size][3]
        )}
        style={{
          animationDelay: '450ms',
        }}
      />
    </div>
  );
}
