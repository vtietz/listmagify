/**
 * Simple Avatar component with image support and initials fallback.
 * Used for displaying user avatars in compact spaces.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps {
  /** User's display name (used for initials) */
  displayName?: string | null;
  /** User's Spotify ID (used as fallback for initials) */
  userId?: string;
  /** URL to the user's profile image */
  imageUrl?: string | null;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
  /** Tooltip title */
  title?: string;
}

/**
 * Get initials from a display name or user ID.
 * Returns up to 2 characters.
 */
function getInitials(displayName?: string | null, userId?: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0]?.[0] ?? '';
      const last = parts[parts.length - 1]?.[0] ?? '';
      return (first + last).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }
  if (userId) {
    return userId.slice(0, 2).toUpperCase();
  }
  return '??';
}

/**
 * Generate a consistent color based on user ID.
 * Uses a simple hash to pick from a palette of colors.
 */
function getAvatarColor(userId?: string): string {
  const colors = [
    'bg-blue-600',
    'bg-green-600',
    'bg-purple-600',
    'bg-orange-600',
    'bg-pink-600',
    'bg-teal-600',
    'bg-indigo-600',
    'bg-rose-600',
  ] as const;
  
  if (!userId) return colors[0];
  
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  
  return colors[Math.abs(hash) % colors.length] ?? colors[0];
}

const sizeClasses = {
  sm: 'h-4 w-4 text-[8px]',
  md: 'h-5 w-5 text-[9px]',
  lg: 'h-6 w-6 text-[10px]',
};

export function Avatar({ displayName, userId, imageUrl, size = 'sm', className, title }: AvatarProps) {
  const initials = getInitials(displayName, userId);
  const colorClass = getAvatarColor(userId);
  const tooltipText = title || displayName || userId || 'Unknown user';
  
  // If we have an image URL, show the image with initials fallback
  if (imageUrl) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center rounded-full overflow-hidden flex-shrink-0',
          sizeClasses[size],
          className
        )}
        title={tooltipText}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={displayName || userId || 'User avatar'}
          className="h-full w-full object-cover"
          onError={(e) => {
            // On error, hide the image to show the fallback
            e.currentTarget.style.display = 'none';
          }}
        />
        {/* Fallback initials behind the image */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center text-white font-medium',
            colorClass
          )}
          style={{ zIndex: -1 }}
        >
          {initials}
        </div>
      </div>
    );
  }
  
  // No image, show initials
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full text-white font-medium flex-shrink-0',
        colorClass,
        sizeClasses[size],
        className
      )}
      title={tooltipText}
    >
      {initials}
    </div>
  );
}

export default Avatar;
