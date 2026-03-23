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

import type { MenuContentProps, TrackActions, ReorderActions, MarkerActions } from './types';
import type { MenuPrimitives } from './MenuPrimitives';
import { buildReorderItems, hasAnyAction, markerAfterLabel, markerBeforeLabel, removeSelectedLabel } from './utils';

interface MenuContentWithPrimitivesProps extends MenuContentProps {
  primitives: MenuPrimitives;
  /** Whether to show the title header (used for popover, not bottom sheet) */
  showTitleHeader?: boolean;
}

type WithClose = MenuContentProps['withClose'];

function BulkActionsSection({
  reorderActions,
  trackActions,
  withClose,
  removeLabel,
  Section,
  Item,
  Divider,
}: {
  reorderActions: ReorderActions | undefined;
  trackActions: TrackActions | undefined;
  withClose: WithClose;
  removeLabel: string;
  Section: MenuPrimitives['Section'];
  Item: MenuPrimitives['Item'];
  Divider: MenuPrimitives['Divider'];
}) {
  return (
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
  );
}

function ReorderSection({
  reorderActions,
  withClose,
  Section,
  Item,
  Divider,
}: {
  reorderActions: ReorderActions | undefined;
  withClose: WithClose;
  Section: MenuPrimitives['Section'];
  Item: MenuPrimitives['Item'];
  Divider: MenuPrimitives['Divider'];
}) {
  const reorderItems = buildReorderItems(reorderActions);
  if (!hasAnyAction(reorderItems)) return null;
  return (
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
  );
}

function MarkerSection({
  markerActions,
  withClose,
  useSelectionWording,
  Section,
  Item,
  Divider,
}: {
  markerActions: MarkerActions | undefined;
  withClose: WithClose;
  useSelectionWording: boolean;
  Section: MenuPrimitives['Section'];
  Item: MenuPrimitives['Item'];
  Divider: MenuPrimitives['Divider'];
}) {
  return (
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
  );
}

function LikeItems({
  trackActions,
  isMultiSelect,
  selectedCount,
  withClose,
  Item,
}: {
  trackActions: TrackActions | undefined;
  isMultiSelect: boolean;
  selectedCount: number;
  withClose: WithClose;
  Item: MenuPrimitives['Item'];
}) {
  if (isMultiSelect) {
    return (
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
    );
  }
  return (
    <Item
      icon={trackActions?.isLiked ? HeartOff : Heart}
      label={trackActions?.isLiked ? 'Remove from Liked' : 'Add to Liked'}
      onClick={withClose(trackActions?.onToggleLiked)}
      disabled={!trackActions?.onToggleLiked}
    />
  );
}

function TrackSection({
  trackActions,
  isMultiSelect,
  selectedCount,
  isEditable,
  withClose,
  removeLabel,
  Section,
  Item,
}: {
  trackActions: TrackActions | undefined;
  isMultiSelect: boolean;
  selectedCount: number;
  isEditable: boolean;
  withClose: WithClose;
  removeLabel: string;
  Section: MenuPrimitives['Section'];
  Item: MenuPrimitives['Item'];
}) {
  const sectionTitle = isMultiSelect && selectedCount > 1 ? `${selectedCount} Tracks` : 'Track';
  return (
    <Section title={sectionTitle}>
      {!isMultiSelect && (
        <Item
          icon={trackActions?.isPlaying ? Pause : Play}
          label={trackActions?.isPlaying ? 'Pause' : 'Play'}
          onClick={withClose(trackActions?.isPlaying ? trackActions?.onPause : trackActions?.onPlay)}
          disabled={!trackActions?.onPlay}
        />
      )}
      {isEditable && trackActions?.onDeleteTrackDuplicates && (
        <Item
          icon={Copy}
          label="Remove duplicates"
          onClick={withClose(trackActions.onDeleteTrackDuplicates)}
        />
      )}
      <LikeItems
        trackActions={trackActions}
        isMultiSelect={isMultiSelect}
        selectedCount={selectedCount}
        withClose={withClose}
        Item={Item}
      />
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
  );
}

function NavigationSection({
  trackActions,
  withClose,
  Section,
  Item,
  Divider,
}: {
  trackActions: TrackActions | undefined;
  withClose: WithClose;
  Section: MenuPrimitives['Section'];
  Item: MenuPrimitives['Item'];
  Divider: MenuPrimitives['Divider'];
}) {
  return (
    <>
      <Divider />
      <Section title="Go to">
        <Item
          icon={User}
          label="Search for artist"
          onClick={withClose(trackActions?.onGoToArtist)}
          disabled={!trackActions?.onGoToArtist}
        />
        <Item
          icon={Disc}
          label="Search for album"
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
  );
}

/**
 * Unified menu content that works for both phone (BottomSheet) and tablet (Popover).
 * The UI primitives are passed in, allowing the same logic to render differently per device.
 * Sections are extracted into focused sub-components to keep complexity manageable.
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

  return (
    <>
      {showTitleHeader && (
        <>
          <div className="px-3 py-1.5 text-sm font-semibold text-muted-foreground truncate max-w-[200px]">
            {title}
          </div>
          <Divider />
        </>
      )}

      {isMultiSelect && isEditable && (
        <BulkActionsSection
          reorderActions={reorderActions}
          trackActions={trackActions}
          withClose={withClose}
          removeLabel={removeLabel}
          Section={Section}
          Item={Item}
          Divider={Divider}
        />
      )}

      {isEditable && (
        <ReorderSection
          reorderActions={reorderActions}
          withClose={withClose}
          Section={Section}
          Item={Item}
          Divider={Divider}
        />
      )}

      {isEditable && (
        <MarkerSection
          markerActions={markerActions}
          withClose={withClose}
          useSelectionWording={useSelectionWording}
          Section={Section}
          Item={Item}
          Divider={Divider}
        />
      )}

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

      <TrackSection
        trackActions={trackActions}
        isMultiSelect={isMultiSelect}
        selectedCount={selectedCount}
        isEditable={isEditable}
        withClose={withClose}
        removeLabel={removeLabel}
        Section={Section}
        Item={Item}
      />

      {!isMultiSelect && (
        <NavigationSection
          trackActions={trackActions}
          withClose={withClose}
          Section={Section}
          Item={Item}
          Divider={Divider}
        />
      )}

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
