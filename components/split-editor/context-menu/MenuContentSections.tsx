'use client';

/**
 * Section sub-components for MenuContent.
 * Each section is responsible for one logical group of menu items,
 * keeping individual function complexity manageable.
 */

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

import type { TrackActions, ReorderActions, MarkerActions, RecommendationActions } from './types';
import type { MenuPrimitives } from './MenuPrimitives';
import { buildReorderItems, hasAnyAction, markerAfterLabel, markerBeforeLabel } from './utils';

type WithClose = (action?: () => void) => () => void;
type SectionC = MenuPrimitives['Section'];
type ItemC = MenuPrimitives['Item'];
type DividerC = MenuPrimitives['Divider'];

// ── pure helpers ────────────────────────────────────────────────────────────

function trackSectionTitle(isMultiSelect: boolean, selectedCount: number): string {
  return isMultiSelect && selectedCount > 1 ? `${selectedCount} Tracks` : 'Track';
}

function addToPlaylistLabel(isMultiSelect: boolean, selectedCount: number): string {
  return isMultiSelect ? `Add ${selectedCount} to playlist...` : 'Add to playlist...';
}

function removeFromPlaylistLabel(isMultiSelect: boolean, multiLabel: string): string {
  return isMultiSelect ? multiLabel : 'Remove from playlist';
}

// ── sub-sections ─────────────────────────────────────────────────────────────

export function BulkActionsSection({
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
  Section: SectionC; Item: ItemC; Divider: DividerC;
}) {
  return (
    <>
      <Section title="Bulk Actions">
        {reorderActions?.onPlaceBeforeMarker && (
          <Item icon={Bookmark} label="Place before marker" onClick={withClose(reorderActions.onPlaceBeforeMarker)} />
        )}
        {reorderActions?.onPlaceAfterMarker && (
          <Item icon={Bookmark} label="Place after marker" onClick={withClose(reorderActions.onPlaceAfterMarker)} />
        )}
        {trackActions?.onRemoveFromPlaylist && trackActions.canRemove && (
          <Item icon={Trash2} label={removeLabel} onClick={withClose(trackActions.onRemoveFromPlaylist)} destructive />
        )}
      </Section>
      <Divider />
    </>
  );
}

export function ReorderSection({
  reorderActions, withClose, Section, Item, Divider,
}: {
  reorderActions: ReorderActions | undefined;
  withClose: WithClose;
  Section: SectionC; Item: ItemC; Divider: DividerC;
}) {
  const reorderItems = buildReorderItems(reorderActions);
  if (!hasAnyAction(reorderItems)) return null;
  return (
    <>
      <Section title="Reorder">
        {reorderItems.map((item) => (
          <Item key={item.key} icon={item.icon} label={item.label} onClick={withClose(item.action)} disabled={!item.action} />
        ))}
      </Section>
      <Divider />
    </>
  );
}

export function MarkerSection({
  markerActions, withClose, useSelectionWording, Section, Item, Divider,
}: {
  markerActions: MarkerActions | undefined;
  withClose: WithClose;
  useSelectionWording: boolean;
  Section: SectionC; Item: ItemC; Divider: DividerC;
}) {
  const hasBefore = markerActions?.hasMarkerBefore ?? false;
  const hasAfter = markerActions?.hasMarkerAfter ?? false;
  return (
    <>
      <Section title="Marker">
        <Item
          icon={hasBefore ? BookmarkMinus : Bookmark}
          label={markerBeforeLabel(hasBefore, useSelectionWording)}
          onClick={withClose(markerActions?.onAddMarkerBefore)}
          {...(hasBefore ? { destructive: true } : {})}
        />
        <Item
          icon={hasAfter ? BookmarkMinus : Bookmark}
          label={markerAfterLabel(hasAfter, useSelectionWording)}
          onClick={withClose(markerActions?.onAddMarkerAfter)}
          {...(hasAfter ? { destructive: true } : {})}
        />
      </Section>
      <Divider />
    </>
  );
}

export function InsertMarkersSection({
  markerActions, isMultiSelect, selectedCount, withClose, Section, Item, Divider,
}: {
  markerActions: MarkerActions | undefined;
  isMultiSelect: boolean;
  selectedCount: number;
  withClose: WithClose;
  Section: SectionC; Item: ItemC; Divider: DividerC;
}) {
  const addToAllMarkers = markerActions?.onAddToAllMarkers;
  if (!markerActions?.hasAnyMarkers || !addToAllMarkers) return null;
  const label = isMultiSelect ? `Add ${selectedCount} to markers` : 'Add to markers';
  return (
    <>
      <Section title="Insert">
        <Item icon={Plus} label={label} onClick={withClose(addToAllMarkers)} />
      </Section>
      <Divider />
    </>
  );
}

function MultiLikeItems({
  trackActions, selectedCount, withClose, Item,
}: { trackActions: TrackActions | undefined; selectedCount: number; withClose: WithClose; Item: ItemC }) {
  const likeAction = trackActions?.onLikeAll ?? trackActions?.onToggleLiked;
  const unlikeAction = trackActions?.onUnlikeAll ?? trackActions?.onToggleLiked;
  return (
    <>
      <Item icon={Heart} label={`Like all ${selectedCount} tracks`} onClick={withClose(likeAction)} disabled={!likeAction} />
      <Item icon={HeartOff} label={`Unlike all ${selectedCount} tracks`} onClick={withClose(unlikeAction)} disabled={!unlikeAction} />
    </>
  );
}

function SingleLikeItem({
  trackActions, withClose, Item,
}: { trackActions: TrackActions | undefined; withClose: WithClose; Item: ItemC }) {
  const isLiked = trackActions?.isLiked ?? false;
  return (
    <Item
      icon={isLiked ? HeartOff : Heart}
      label={isLiked ? 'Remove from Liked' : 'Add to Liked'}
      onClick={withClose(trackActions?.onToggleLiked)}
      disabled={!trackActions?.onToggleLiked}
    />
  );
}

function LikeItems({
  trackActions, isMultiSelect, selectedCount, withClose, Item,
}: { trackActions: TrackActions | undefined; isMultiSelect: boolean; selectedCount: number; withClose: WithClose; Item: ItemC }) {
  if (isMultiSelect) return <MultiLikeItems trackActions={trackActions} selectedCount={selectedCount} withClose={withClose} Item={Item} />;
  return <SingleLikeItem trackActions={trackActions} withClose={withClose} Item={Item} />;
}

function PlayItem({
  trackActions, withClose, Item,
}: { trackActions: TrackActions | undefined; withClose: WithClose; Item: ItemC }) {
  const isPlaying = trackActions?.isPlaying ?? false;
  const onClick = withClose(isPlaying ? trackActions?.onPause : trackActions?.onPlay);
  return <Item icon={isPlaying ? Pause : Play} label={isPlaying ? 'Pause' : 'Play'} onClick={onClick} disabled={!trackActions?.onPlay} />;
}

export function TrackSection({
  trackActions, isMultiSelect, selectedCount, isEditable, withClose, removeLabel, Section, Item,
}: {
  trackActions: TrackActions | undefined;
  isMultiSelect: boolean;
  selectedCount: number;
  isEditable: boolean;
  withClose: WithClose;
  removeLabel: string;
  Section: SectionC; Item: ItemC;
}) {
  return (
    <Section title={trackSectionTitle(isMultiSelect, selectedCount)}>
      {!isMultiSelect && <PlayItem trackActions={trackActions} withClose={withClose} Item={Item} />}
      {isEditable && trackActions?.onDeleteTrackDuplicates && (
        <Item icon={Copy} label="Remove duplicates" onClick={withClose(trackActions.onDeleteTrackDuplicates)} />
      )}
      <LikeItems trackActions={trackActions} isMultiSelect={isMultiSelect} selectedCount={selectedCount} withClose={withClose} Item={Item} />
      {trackActions?.onAddToPlaylist && (
        <Item icon={Plus} label={addToPlaylistLabel(isMultiSelect, selectedCount)} onClick={withClose(trackActions.onAddToPlaylist)} />
      )}
      {isEditable && trackActions?.onRemoveFromPlaylist && trackActions.canRemove && (
        <Item icon={Trash2} label={removeFromPlaylistLabel(isMultiSelect, removeLabel)} onClick={withClose(trackActions.onRemoveFromPlaylist)} destructive />
      )}
    </Section>
  );
}

export function NavigationSection({
  trackActions, withClose, Section, Item, Divider,
}: {
  trackActions: TrackActions | undefined;
  withClose: WithClose;
  Section: SectionC; Item: ItemC; Divider: DividerC;
}) {
  return (
    <>
      <Divider />
      <Section title="Go to">
        <Item icon={User} label="Search for artist" onClick={withClose(trackActions?.onGoToArtist)} disabled={!trackActions?.onGoToArtist} />
        <Item icon={Disc} label="Search for album" onClick={withClose(trackActions?.onGoToAlbum)} disabled={!trackActions?.onGoToAlbum} />
        <Item icon={ExternalLink} label="Open in Spotify" onClick={withClose(trackActions?.onOpenInSpotify)} disabled={!trackActions?.onOpenInSpotify} />
      </Section>
    </>
  );
}

export function RecommendationsSection({
  recActions, withClose, Section, Item, Divider,
}: {
  recActions: RecommendationActions | undefined;
  withClose: WithClose;
  Section: SectionC; Item: ItemC; Divider: DividerC;
}) {
  if (!recActions?.onShowSimilar && !recActions?.onOpenBrowse) return null;
  return (
    <>
      <Divider />
      <Section title="Recommendations">
        <Item icon={Sparkles} label="Show similar tracks" onClick={withClose(recActions?.onShowSimilar)} disabled={!recActions?.onShowSimilar} />
      </Section>
    </>
  );
}

export function ClearSelectionSection({
  trackActions, withClose, Section, Item, Divider,
}: {
  trackActions: TrackActions | undefined;
  withClose: WithClose;
  Section: SectionC; Item: ItemC; Divider: DividerC;
}) {
  if (!trackActions?.onClearSelection) return null;
  return (
    <>
      <Divider />
      <Section>
        <Item icon={X} label="Clear selection" onClick={withClose(trackActions.onClearSelection)} />
      </Section>
    </>
  );
}
