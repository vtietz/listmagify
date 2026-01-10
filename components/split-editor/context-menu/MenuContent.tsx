'use client';


import {
  Bookmark,
  BookmarkMinus,
  Copy,
  Disc,
  ExternalLink,
  Heart,
  HeartOff,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';

import type { MenuContentProps } from './types';
import type { MenuPrimitives } from './MenuPrimitives';
import { buildReorderItems, hasAnyAction, markerAfterLabel, markerBeforeLabel, removeSelectedLabel } from './utils';

interface MenuContentWithPrimitivesProps extends MenuContentProps {
  primitives: MenuPrimitives;
  /** Whether to show the title header (used for popover, not bottom sheet) */
  showTitleHeader?: boolean;
}

/**
 * Unified menu content that works for both phone (BottomSheet) and tablet (Popover).
 * The UI primitives are passed in, allowing the same logic to render differently per device.
 */
export function MenuContent({
  title,
  withClose,
  reorderActions,
  markerActions,
  trackActions,
  recActions,
  isMultiSelect,
  selectedCount,
  isEditable,
  primitives,
  showTitleHeader = false,
}: MenuContentWithPrimitivesProps) {
  const { Section, Item, Divider } = primitives;
  const useSelectionWording = isMultiSelect && selectedCount > 1;
  const removeLabel = removeSelectedLabel(selectedCount);
  const reorderItems = buildReorderItems(reorderActions);

  return (
    <>
      {/* Title header (for popover only) */}
      {showTitleHeader && (
        <>
          <div className="px-3 py-1.5 text-sm font-semibold text-muted-foreground truncate max-w-[200px]">
            {title}
          </div>
          <Divider />
        </>
      )}

      {/* Bulk actions for multi-select */}
      {isMultiSelect && isEditable && (
        <>
          <Section title="Bulk Actions">
            {reorderActions?.onPlaceBeforeMarker && (
              <Item
                icon={Bookmark}
                label="Place before marker"
                onClick={withClose(reorderActions.onPlaceBeforeMarker)}
              />
            )}
            {reorderActions?.onPlaceAfterMarker && (
              <Item
                icon={Bookmark}
                label="Place after marker"
                onClick={withClose(reorderActions.onPlaceAfterMarker)}
              />
            )}
            {trackActions?.onRemoveFromPlaylist && trackActions.canRemove && (
              <Item
                icon={Trash2}
                label={removeLabel}
                onClick={withClose(trackActions.onRemoveFromPlaylist)}
                destructive
              />
            )}
          </Section>
          <Divider />
        </>
      )}

      {/* Reorder actions - available for both single and multi-select */}
      {isEditable && hasAnyAction(reorderItems) && (
        <>
          <Section title="Reorder">
            {reorderItems.map((item) => (
              <Item
                key={item.key}
                icon={item.icon}
                label={item.label}
                onClick={withClose(item.action)}
                disabled={!item.action}
              />
            ))}
          </Section>
          <Divider />
        </>
      )}

      {/* Marker actions */}
      {isEditable && (
        <>
          <Section title="Marker">
            <Item
              icon={markerActions?.hasMarkerBefore ? BookmarkMinus : Bookmark}
              label={markerBeforeLabel(markerActions?.hasMarkerBefore, useSelectionWording)}
              onClick={withClose(markerActions?.onAddMarkerBefore)}
              {...(markerActions?.hasMarkerBefore ? { destructive: true } : {})}
            />
            <Item
              icon={markerActions?.hasMarkerAfter ? BookmarkMinus : Bookmark}
              label={markerAfterLabel(markerActions?.hasMarkerAfter, useSelectionWording)}
              onClick={withClose(markerActions?.onAddMarkerAfter)}
              {...(markerActions?.hasMarkerAfter ? { destructive: true } : {})}
            />
          </Section>
          <Divider />
        </>
      )}

      {/* Add to all markers - available when markers exist */}
      {markerActions?.hasAnyMarkers && markerActions?.onAddToAllMarkers && (
        <>
          <Section title="Insert">
            <Item
              icon={Plus}
              label={isMultiSelect ? `Add ${selectedCount} to markers` : 'Add to markers'}
              onClick={withClose(markerActions.onAddToAllMarkers)}
            />
          </Section>
          <Divider />
        </>
      )}

      {/* Track actions */}
      <Section title={isMultiSelect && selectedCount > 1 ? `${selectedCount} Tracks` : 'Track'}>
        {/* Play - only for single track */}
        {!isMultiSelect && (
          <Item
            icon={trackActions?.isPlaying ? Pause : Play}
            label={trackActions?.isPlaying ? 'Pause' : 'Play'}
            onClick={withClose(trackActions?.isPlaying ? trackActions?.onPause : trackActions?.onPlay)}
            disabled={!trackActions?.onPlay}
          />
        )}

        {/* Delete Duplicates - available when handler is provided */}
        {isEditable && trackActions?.onDeleteTrackDuplicates && (
          <Item
            icon={Copy}
            label="Delete duplicates"
            onClick={withClose(trackActions.onDeleteTrackDuplicates)}
            destructive
          />
        )}

        {/* Like/Unlike - for multi-select show both options, for single show toggle */}
        {isMultiSelect ? (
          <>
            <Item
              icon={Heart}
              label={`Like all ${selectedCount} tracks`}
              onClick={withClose(trackActions?.onLikeAll ?? trackActions?.onToggleLiked)}
              disabled={!trackActions?.onLikeAll && !trackActions?.onToggleLiked}
            />
            <Item
              icon={HeartOff}
              label={`Unlike all ${selectedCount} tracks`}
              onClick={withClose(trackActions?.onUnlikeAll ?? trackActions?.onToggleLiked)}
              disabled={!trackActions?.onUnlikeAll && !trackActions?.onToggleLiked}
            />
          </>
        ) : (
          <Item
            icon={trackActions?.isLiked ? HeartOff : Heart}
            label={trackActions?.isLiked ? 'Remove from Liked' : 'Add to Liked'}
            onClick={withClose(trackActions?.onToggleLiked)}
            disabled={!trackActions?.onToggleLiked}
          />
        )}

        {trackActions?.onAddToPlaylist && (
          <Item
            icon={Plus}
            label={isMultiSelect ? `Add ${selectedCount} to playlist...` : 'Add to playlist...'}
            onClick={withClose(trackActions.onAddToPlaylist)}
          />
        )}

        {isEditable && trackActions?.onRemoveFromPlaylist && trackActions.canRemove && (
          <Item
            icon={Trash2}
            label={isMultiSelect ? removeLabel : 'Remove from playlist'}
            onClick={withClose(trackActions.onRemoveFromPlaylist)}
            destructive
          />
        )}
      </Section>

      {/* Navigation - only for single track */}
      {!isMultiSelect && (
        <>
          <Divider />
          <Section title="Go to">
            <Item
              icon={User}
              label="Go to artist"
              onClick={withClose(trackActions?.onGoToArtist)}
              disabled={!trackActions?.onGoToArtist}
            />
            <Item
              icon={Disc}
              label="Go to album"
              onClick={withClose(trackActions?.onGoToAlbum)}
              disabled={!trackActions?.onGoToAlbum}
            />
            <Item
              icon={ExternalLink}
              label="Open in Spotify"
              onClick={withClose(trackActions?.onOpenInSpotify)}
              disabled={!trackActions?.onOpenInSpotify}
            />
          </Section>
        </>
      )}

      {/* Recommendations - only for single track */}
      {!isMultiSelect && (recActions?.onShowSimilar || recActions?.onOpenBrowse) && (
        <>
          <Divider />
          <Section title="Recommendations">
            <Item
              icon={Sparkles}
              label="Show similar tracks"
              onClick={withClose(recActions?.onShowSimilar)}
              disabled={!recActions?.onShowSimilar}
            />
          </Section>
        </>
      )}

      {/* Clear selection - only for multi-select */}
      {isMultiSelect && trackActions?.onClearSelection && (
        <>
          <Divider />
          <Section>
            <Item
              icon={X}
              label="Clear selection"
              onClick={withClose(trackActions.onClearSelection)}
            />
          </Section>
        </>
      )}
    </>
  );
}
