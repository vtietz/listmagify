/**
 * TrackContextMenu - Context menu for track actions.
 * Adapts to device type:
 * - Phone: Bottom sheet (long press or "..." button)
 * - Tablet: Popover near the tapped row
 * - Desktop: Right-click menu or "..." button
 * 
 * Note: Complexity rule disabled for this file as it contains many
 * conditional menu item renders which is inherent to menu components.
 */
/* eslint-disable complexity */

'use client';

import * as React from 'react';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  Pause,
  Heart,
  HeartOff,
  Trash2,
  Plus,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Bookmark,
  BookmarkMinus,
  Disc,
  User,
  Sparkles,
  MoreHorizontal,
  ExternalLink,
  X,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeviceType } from '@/hooks/useDeviceType';
import { BottomSheet, BottomSheetMenuItem, BottomSheetSection, BottomSheetDivider } from '@/components/ui/BottomSheet';
import type { Track } from '@/lib/spotify/types';

type MenuItemDef = {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  action?: (() => void) | undefined;
  destructive?: boolean;
};

function pluralizeTrack(count: number) {
  return count === 1 ? 'track' : 'tracks';
}

function removeSelectedLabel(selectedCount: number) {
  return `Remove ${selectedCount} ${pluralizeTrack(selectedCount)}`;
}

function markerBeforeLabel(hasMarkerBefore: boolean | undefined, useSelectionWording: boolean) {
  if (hasMarkerBefore) return useSelectionWording ? 'Remove marker above selection' : 'Remove marker before';
  return useSelectionWording ? 'Add marker above selection' : 'Add marker before';
}

function markerAfterLabel(hasMarkerAfter: boolean | undefined, useSelectionWording: boolean) {
  if (hasMarkerAfter) return useSelectionWording ? 'Remove marker below selection' : 'Remove marker after';
  return useSelectionWording ? 'Add marker below selection' : 'Add marker after';
}

function buildReorderItems(reorderActions: ReorderActions | undefined): MenuItemDef[] {
  return [
    { key: 'move-up', icon: ChevronUp, label: 'Move up', action: reorderActions?.onMoveUp },
    { key: 'move-down', icon: ChevronDown, label: 'Move down', action: reorderActions?.onMoveDown },
    { key: 'move-top', icon: ChevronsUp, label: 'Move to top', action: reorderActions?.onMoveToTop },
    { key: 'move-bottom', icon: ChevronsDown, label: 'Move to bottom', action: reorderActions?.onMoveToBottom },
  ];
}

function hasAnyAction(items: MenuItemDef[]) {
  return items.some((i) => !!i.action);
}

// Action group types
export interface ReorderActions {
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
  onMoveToTop?: (() => void) | undefined;
  onMoveToBottom?: (() => void) | undefined;
  onPlaceBeforeMarker?: (() => void) | undefined;
  onPlaceAfterMarker?: (() => void) | undefined;
}

export interface MarkerActions {
  onAddMarkerBefore?: () => void;
  onAddMarkerAfter?: () => void;
  onRemoveMarker?: () => void;
  onAddToAllMarkers?: () => void;
  hasMarkerBefore?: boolean;
  hasMarkerAfter?: boolean;
  hasAnyMarkers?: boolean;
}

export interface TrackActions {
  onAddToPlaylist?: () => void;
  onRemoveFromPlaylist?: () => void;
  onToggleLiked?: () => void;
  /** For multi-select: explicitly like all selected tracks */
  onLikeAll?: () => void;
  /** For multi-select: explicitly unlike all selected tracks */
  onUnlikeAll?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onGoToArtist?: () => void;
  onGoToAlbum?: () => void;
  onOpenInSpotify?: () => void;
  /** Clear current selection */
  onClearSelection?: () => void;
  /** Delete all duplicates of this specific track (keeps the selected one) */
  onDeleteTrackDuplicates?: () => void;
  isPlaying?: boolean;
  isLiked?: boolean;
  canRemove?: boolean;
}

export interface RecommendationActions {
  onShowSimilar?: () => void;
  onOpenBrowse?: () => void;
}

interface TrackContextMenuProps {
  /** The track this menu is for */
  track: Track;
  /** Whether the menu is open */
  isOpen: boolean;
  /** Callback to close the menu */
  onClose: () => void;
  /** Position for popover (tablet) */
  position?: { x: number; y: number };
  /** Reorder action handlers */
  reorderActions?: ReorderActions;
  /** Marker action handlers */
  markerActions?: MarkerActions;
  /** Track action handlers */
  trackActions?: TrackActions;
  /** Recommendation action handlers */
  recActions?: RecommendationActions;
  /** Whether multiple tracks are selected */
  isMultiSelect?: boolean;
  /** Number of selected tracks */
  selectedCount?: number;
  /** Whether the playlist is editable */
  isEditable?: boolean;
}

// Shared props for menu content components
interface MenuContentProps {
  title: string;
  withClose: (action?: () => void) => () => void;
  reorderActions: ReorderActions | undefined;
  markerActions: MarkerActions | undefined;
  trackActions: TrackActions | undefined;
  recActions: RecommendationActions | undefined;
  isMultiSelect: boolean;
  selectedCount: number;
  isEditable: boolean;
}

/**
 * PhoneMenuContent - Bottom sheet content for phone devices.
 */
function PhoneMenuContent({
  title: _title,
  withClose,
  reorderActions,
  markerActions,
  trackActions,
  recActions,
  isMultiSelect,
  selectedCount,
  isEditable,
}: MenuContentProps) {
  const useSelectionWording = isMultiSelect && selectedCount > 1;
  const removeLabel = removeSelectedLabel(selectedCount);
  const reorderItems = buildReorderItems(reorderActions);

  return (
    <>
      {/* Bulk actions for multi-select */}
      {isMultiSelect && isEditable && (
        <>
          <BottomSheetSection title="Bulk Actions">
            {reorderActions?.onPlaceBeforeMarker && (
              <BottomSheetMenuItem
                icon={Bookmark}
                label="Place before marker"
                onClick={withClose(reorderActions.onPlaceBeforeMarker)}
              />
            )}
            {reorderActions?.onPlaceAfterMarker && (
              <BottomSheetMenuItem
                icon={Bookmark}
                label="Place after marker"
                onClick={withClose(reorderActions.onPlaceAfterMarker)}
              />
            )}
            {trackActions?.onRemoveFromPlaylist && trackActions.canRemove && (
              <BottomSheetMenuItem
                icon={Trash2}
                label={removeLabel}
                onClick={withClose(trackActions.onRemoveFromPlaylist)}
                destructive
              />
            )}
          </BottomSheetSection>
          <BottomSheetDivider />
        </>
      )}

      {/* Reorder actions - available for both single and multi-select */}
      {isEditable && hasAnyAction(reorderItems) && (
        <>
          <BottomSheetSection title="Reorder">
            {reorderItems.map((item) => (
              <BottomSheetMenuItem
                key={item.key}
                icon={item.icon}
                label={item.label}
                onClick={withClose(item.action)}
                disabled={!item.action}
              />
            ))}
          </BottomSheetSection>
          <BottomSheetDivider />
        </>
      )}

      {/* Marker actions */}
      {isEditable && (
        <>
          <BottomSheetSection title="Marker">
            <BottomSheetMenuItem
              icon={markerActions?.hasMarkerBefore ? BookmarkMinus : Bookmark}
              label={markerBeforeLabel(markerActions?.hasMarkerBefore, useSelectionWording)}
              onClick={withClose(markerActions?.onAddMarkerBefore)}
              {...(markerActions?.hasMarkerBefore && { destructive: true })}
            />
            <BottomSheetMenuItem
              icon={markerActions?.hasMarkerAfter ? BookmarkMinus : Bookmark}
              label={markerAfterLabel(markerActions?.hasMarkerAfter, useSelectionWording)}
              onClick={withClose(markerActions?.onAddMarkerAfter)}
              {...(markerActions?.hasMarkerAfter && { destructive: true })}
            />
          </BottomSheetSection>
          <BottomSheetDivider />
        </>
      )}

      {/* Add to all markers - available when markers exist */}
      {markerActions?.hasAnyMarkers && markerActions?.onAddToAllMarkers && (
        <>
          <BottomSheetSection title="Insert">
            <BottomSheetMenuItem
              icon={Plus}
              label={isMultiSelect ? `Add ${selectedCount} to markers` : 'Add to markers'}
              onClick={withClose(markerActions.onAddToAllMarkers)}
            />
          </BottomSheetSection>
          <BottomSheetDivider />
        </>
      )}

      {/* Track actions */}
      <BottomSheetSection title={isMultiSelect && selectedCount > 1 ? `${selectedCount} Tracks` : 'Track'}>
        {/* Play - only for single track */}
        {!isMultiSelect && (
          <BottomSheetMenuItem
            icon={trackActions?.isPlaying ? Pause : Play}
            label={trackActions?.isPlaying ? 'Pause' : 'Play'}
            onClick={withClose(trackActions?.isPlaying ? trackActions?.onPause : trackActions?.onPlay)}
            disabled={!trackActions?.onPlay}
          />
        )}
        {/* Delete Duplicates - available when handler is provided (caller decides if applicable) */}
        {isEditable && trackActions?.onDeleteTrackDuplicates && (
          <BottomSheetMenuItem
            icon={Copy}
            label="Delete duplicates"
            onClick={withClose(trackActions.onDeleteTrackDuplicates)}
            destructive
          />
        )}
        {/* Like/Unlike - for multi-select show both options, for single show toggle */}
        {isMultiSelect ? (
          <>
            <BottomSheetMenuItem
              icon={Heart}
              label={`Like all ${selectedCount} tracks`}
              onClick={withClose(trackActions?.onLikeAll ?? trackActions?.onToggleLiked)}
              disabled={!trackActions?.onLikeAll && !trackActions?.onToggleLiked}
            />
            <BottomSheetMenuItem
              icon={HeartOff}
              label={`Unlike all ${selectedCount} tracks`}
              onClick={withClose(trackActions?.onUnlikeAll ?? trackActions?.onToggleLiked)}
              disabled={!trackActions?.onUnlikeAll && !trackActions?.onToggleLiked}
            />
          </>
        ) : (
          <BottomSheetMenuItem
            icon={trackActions?.isLiked ? HeartOff : Heart}
            label={trackActions?.isLiked ? 'Remove from Liked' : 'Add to Liked'}
            onClick={withClose(trackActions?.onToggleLiked)}
            disabled={!trackActions?.onToggleLiked}
          />
        )}
        {trackActions?.onAddToPlaylist && (
          <BottomSheetMenuItem
            icon={Plus}
            label={isMultiSelect ? `Add ${selectedCount} to playlist...` : 'Add to playlist...'}
            onClick={withClose(trackActions.onAddToPlaylist)}
          />
        )}
        {isEditable && trackActions?.onRemoveFromPlaylist && trackActions.canRemove && (
          <BottomSheetMenuItem
            icon={Trash2}
            label={isMultiSelect ? removeLabel : 'Remove from playlist'}
            onClick={withClose(trackActions.onRemoveFromPlaylist)}
            destructive
          />
        )}
      </BottomSheetSection>

      {/* Navigation - only for single track */}
      {!isMultiSelect && (
        <>
          <BottomSheetDivider />
          <BottomSheetSection title="Go to">
            <BottomSheetMenuItem
              icon={User}
              label="Go to artist"
              onClick={withClose(trackActions?.onGoToArtist)}
              disabled={!trackActions?.onGoToArtist}
            />
            <BottomSheetMenuItem
              icon={Disc}
              label="Go to album"
              onClick={withClose(trackActions?.onGoToAlbum)}
              disabled={!trackActions?.onGoToAlbum}
            />
            <BottomSheetMenuItem
              icon={ExternalLink}
              label="Open in Spotify"
              onClick={withClose(trackActions?.onOpenInSpotify)}
              disabled={!trackActions?.onOpenInSpotify}
            />
          </BottomSheetSection>
        </>
      )}

      {/* Recommendations - only for single track */}
      {!isMultiSelect && (recActions?.onShowSimilar || recActions?.onOpenBrowse) && (
        <>
          <BottomSheetDivider />
          <BottomSheetSection title="Recommendations">
            <BottomSheetMenuItem
              icon={Sparkles}
              label="Show similar tracks"
              onClick={withClose(recActions?.onShowSimilar)}
              disabled={!recActions?.onShowSimilar}
            />
          </BottomSheetSection>
        </>
      )}
    </>
  );
}

/**
 * TabletMenuContent - Popover content for tablet devices.
 */
function TabletMenuContent({
  title,
  withClose,
  reorderActions,
  markerActions,
  trackActions,
  isMultiSelect,
  selectedCount,
  isEditable,
}: MenuContentProps) {
  const useSelectionWording = isMultiSelect && selectedCount > 1;
  const removeLabel = removeSelectedLabel(selectedCount);
  const reorderItems = buildReorderItems(reorderActions);

  return (
    <div className="py-2">
      <div className="px-3 py-1.5 text-sm font-semibold text-muted-foreground truncate max-w-[200px]">
        {title}
      </div>
      <div className="h-px bg-border my-1" />
      
      {/* Reorder - available for both single and multi-select */}
      {isEditable && hasAnyAction(reorderItems) && (
        <>
          {reorderItems.map((item) => (
            <PopoverMenuItem
              key={item.key}
              icon={item.icon}
              label={item.label}
              onClick={withClose(item.action)}
              disabled={!item.action}
            />
          ))}
          <div className="h-px bg-border my-1" />
        </>
      )}
      
      {/* Marker */}
      {isEditable && (
        <>
          <PopoverMenuItem 
            icon={markerActions?.hasMarkerBefore ? BookmarkMinus : Bookmark} 
            label={markerActions?.hasMarkerBefore 
              ? markerBeforeLabel(true, useSelectionWording)
              : markerBeforeLabel(false, useSelectionWording)}
            onClick={withClose(markerActions?.onAddMarkerBefore)}
            {...(markerActions?.hasMarkerBefore && { destructive: true })}
          />
          <PopoverMenuItem 
            icon={markerActions?.hasMarkerAfter ? BookmarkMinus : Bookmark} 
            label={markerActions?.hasMarkerAfter 
              ? markerAfterLabel(true, useSelectionWording)
              : markerAfterLabel(false, useSelectionWording)}
            onClick={withClose(markerActions?.onAddMarkerAfter)}
            {...(markerActions?.hasMarkerAfter && { destructive: true })}
          />
          <div className="h-px bg-border my-1" />
        </>
      )}
      
      {/* Add to all markers */}
      {markerActions?.hasAnyMarkers && markerActions?.onAddToAllMarkers && (
        <>
          <PopoverMenuItem 
            icon={Plus} 
            label={isMultiSelect ? `Add ${selectedCount} to markers` : 'Add to markers'} 
            onClick={withClose(markerActions.onAddToAllMarkers)}
          />
          <div className="h-px bg-border my-1" />
        </>
      )}
      
      {/* Track actions */}
      {/* Play - only for single track */}
      {!isMultiSelect && (
        <PopoverMenuItem 
          icon={trackActions?.isPlaying ? Pause : Play} 
          label={trackActions?.isPlaying ? 'Pause' : 'Play'} 
          onClick={withClose(trackActions?.isPlaying ? trackActions?.onPause : trackActions?.onPlay)} 
        />
      )}
      {/* Delete Duplicates - available when handler is provided */}
      {isEditable && trackActions?.onDeleteTrackDuplicates && (
        <PopoverMenuItem 
          icon={Copy} 
          label="Delete duplicates" 
          onClick={withClose(trackActions.onDeleteTrackDuplicates)}
          destructive
        />
      )}
      {/* Like/Unlike - for multi-select show both options, for single show toggle */}
      {isMultiSelect ? (
        <>
          <PopoverMenuItem 
            icon={Heart} 
            label={`Like all ${selectedCount}`}
            onClick={withClose(trackActions?.onLikeAll ?? trackActions?.onToggleLiked)} 
          />
          <PopoverMenuItem 
            icon={HeartOff} 
            label={`Unlike all ${selectedCount}`}
            onClick={withClose(trackActions?.onUnlikeAll ?? trackActions?.onToggleLiked)} 
          />
        </>
      ) : (
        <PopoverMenuItem 
          icon={trackActions?.isLiked ? HeartOff : Heart} 
          label={trackActions?.isLiked ? 'Unlike' : 'Like'} 
          onClick={withClose(trackActions?.onToggleLiked)} 
        />
      )}
      
      {/* Navigation - only for single track */}
      {!isMultiSelect && (
        <>
          <div className="h-px bg-border my-1" />
          <PopoverMenuItem 
            icon={User} 
            label="Go to artist" 
            onClick={withClose(trackActions?.onGoToArtist)}
            disabled={!trackActions?.onGoToArtist}
          />
          <PopoverMenuItem 
            icon={Disc} 
            label="Go to album" 
            onClick={withClose(trackActions?.onGoToAlbum)}
            disabled={!trackActions?.onGoToAlbum}
          />
          <PopoverMenuItem 
            icon={ExternalLink} 
            label="Open in Spotify" 
            onClick={withClose(trackActions?.onOpenInSpotify)}
            disabled={!trackActions?.onOpenInSpotify}
          />
        </>
      )}
      
      {/* Remove - works for both single and multi */}
      {isEditable && trackActions?.canRemove && (
        <>
          <div className="h-px bg-border my-1" />
          <PopoverMenuItem 
            icon={Trash2} 
            label={isMultiSelect ? removeLabel : 'Remove from playlist'}
            onClick={withClose(trackActions?.onRemoveFromPlaylist)}
            destructive
          />
        </>
      )}
      
      {/* Clear selection - only for multi-select */}
      {isMultiSelect && trackActions?.onClearSelection && (
        <>
          <div className="h-px bg-border my-1" />
          <PopoverMenuItem 
            icon={X} 
            label="Clear selection"
            onClick={withClose(trackActions.onClearSelection)}
          />
        </>
      )}
    </div>
  );
}

export function TrackContextMenu({
  track,
  isOpen,
  onClose,
  position,
  reorderActions,
  markerActions,
  trackActions,
  recActions,
  isMultiSelect = false,
  selectedCount = 1,
  isEditable = false,
}: TrackContextMenuProps) {
  const { isPhone } = useDeviceType();
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Ensure we only render portal after mount (for SSR compatibility)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate menu position to keep it within viewport
  const menuPosition = useMemo(() => {
    if (!position) return null;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;
    
    // Estimate menu dimensions (actual width ~200px, height varies)
    const menuWidth = 220;
    const menuHeight = 450; // Conservative estimate for full menu

    // Calculate left position - keep within viewport
    let left = position.x;
    if (left + menuWidth > viewportWidth - padding) {
      left = Math.max(padding, viewportWidth - menuWidth - padding);
    }

    // Calculate top position - keep within viewport
    let top = position.y;
    if (top + menuHeight > viewportHeight - padding) {
      top = Math.max(padding, viewportHeight - menuHeight - padding);
    }

    return { left, top };
  }, [position]);

  // Action wrapper that closes menu after action
  const withClose = useCallback((action?: () => void) => {
    return () => {
      action?.();
      onClose();
    };
  }, [onClose]);

  // Title format: "Track Name" or "Track Name +N" for multi-select
  const title = isMultiSelect && selectedCount > 1
    ? `${track.name} +${selectedCount - 1}`
    : track.name;

  // Shared props for menu content - pass directly to avoid type issues
  const phoneProps = {
    title,
    withClose,
    reorderActions,
    markerActions,
    trackActions,
    recActions,
    isMultiSelect,
    selectedCount,
    isEditable,
  };

  // Phone: Use BottomSheet
  if (isPhone) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
        <PhoneMenuContent {...phoneProps} />
      </BottomSheet>
    );
  }

  // Don't render until mounted (SSR safety) or if no position
  if (!mounted || !menuPosition) {
    return null;
  }

  // Tablet and Desktop: Use Popover rendered via portal
  const popoverContent = (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[9998]" 
          onClick={onClose}
          onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        />
      )}
      <div
        ref={menuRef}
        className={cn(
          'fixed z-[9999] bg-popover border border-border rounded-md shadow-lg min-w-[180px]',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        style={{
          left: menuPosition.left,
          top: menuPosition.top,
          maxHeight: 'calc(100vh - 16px)',
          overflowY: 'auto',
        }}
      >
        <TabletMenuContent {...phoneProps} />
      </div>
    </>
  );

  return createPortal(popoverContent, document.body);
}

// Helper component for popover menu items
function PopoverMenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent cursor-pointer',
        destructive && !disabled && 'text-destructive hover:bg-destructive/10'
      )}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <Icon className={cn('h-4 w-4', destructive && 'text-destructive')} />
      {label}
    </button>
  );
}

/**
 * ContextMenuTrigger - The "..." button that opens context menu.
 * Touch-friendly with 44x44px minimum target.
 */
interface ContextMenuTriggerProps {
  onClick: (e: React.MouseEvent) => void;
  isCompact?: boolean;
}

export function ContextMenuTrigger({ onClick, isCompact = false }: ContextMenuTriggerProps) {
  return (
    <button
      className={cn(
        'touch-target flex items-center justify-center rounded hover:bg-muted',
        'opacity-0 group-hover/row:opacity-100 focus:opacity-100',
        isCompact ? 'w-6 h-6' : 'w-8 h-8'
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      aria-label="More options"
    >
      <MoreHorizontal className={isCompact ? 'h-4 w-4' : 'h-5 w-5'} />
    </button>
  );
}

/**
 * Hook to manage context menu state with long-press support.
 */
export function useTrackContextMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | undefined>();
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const { isPhone, isTablet } = useDeviceType();

  const open = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e && 'clientX' in e) {
      setPosition({ x: e.clientX, y: e.clientY });
    } else if (e && 'touches' in e && e.touches[0]) {
      setPosition({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setPosition(undefined);
  }, []);

  // Long press handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isPhone && !isTablet) return;
    
    longPressTimer.current = setTimeout(() => {
      open(e);
    }, 500); // 500ms long press
  }, [isPhone, isTablet, open]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Right-click handler for desktop
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    open(e);
  }, [open]);

  return {
    isOpen,
    position,
    open,
    close,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
      onTouchMove: handleTouchMove,
      onContextMenu: handleContextMenu,
    },
  };
}
