'use client';

import type { MenuContentProps } from './types';
import type { MenuPrimitives } from './MenuPrimitives';
import { removeSelectedLabel } from './utils';
import {
  BulkActionsSection,
  ReorderSection,
  MarkerSection,
  InsertMarkersSection,
  TrackSection,
  NavigationSection,
  RecommendationsSection,
  ClearSelectionSection,
  PendingResolutionSection,
} from './MenuContentSections';

interface MenuContentWithPrimitivesProps extends MenuContentProps {
  primitives: MenuPrimitives;
  /** Whether to show the title header (used for popover, not bottom sheet) */
  showTitleHeader?: boolean;
}

/**
 * Unified menu content that works for both phone (BottomSheet) and tablet (Popover).
 * The UI primitives are passed in, allowing the same logic to render differently per device.
 * Section sub-components live in MenuContentSections.tsx to keep complexity manageable.
 */
export function MenuContent({
  title,
  withClose,
  reorderActions,
  markerActions,
  trackActions,
  recActions,
  pendingActions,
  isMultiSelect,
  selectedCount,
  isEditable,
  primitives,
  showTitleHeader = false,
}: MenuContentWithPrimitivesProps) {
  const { Section, Item, Divider } = primitives;
  const useSelectionWording = isMultiSelect && selectedCount > 1;
  const removeLabel = removeSelectedLabel(selectedCount);

  if (pendingActions) {
    return (
      <PendingResolutionSection
        pendingActions={pendingActions}
        withClose={withClose}
        Section={Section}
        Item={Item}
      />
    );
  }

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
          reorderActions={reorderActions} trackActions={trackActions} withClose={withClose}
          removeLabel={removeLabel} Section={Section} Item={Item} Divider={Divider}
        />
      )}

      {isEditable && (
        <ReorderSection
          reorderActions={reorderActions} withClose={withClose}
          Section={Section} Item={Item} Divider={Divider}
        />
      )}

      {isEditable && (
        <MarkerSection
          markerActions={markerActions} withClose={withClose} useSelectionWording={useSelectionWording}
          Section={Section} Item={Item} Divider={Divider}
        />
      )}

      <InsertMarkersSection
        markerActions={markerActions} isMultiSelect={isMultiSelect} selectedCount={selectedCount}
        withClose={withClose} Section={Section} Item={Item} Divider={Divider}
      />

      <TrackSection
        trackActions={trackActions} isMultiSelect={isMultiSelect} selectedCount={selectedCount}
        isEditable={isEditable} withClose={withClose} removeLabel={removeLabel}
        Section={Section} Item={Item}
      />

      {!isMultiSelect && (
        <NavigationSection
          trackActions={trackActions} withClose={withClose}
          Section={Section} Item={Item} Divider={Divider}
        />
      )}

      {!isMultiSelect && (
        <RecommendationsSection
          recActions={recActions} withClose={withClose}
          Section={Section} Item={Item} Divider={Divider}
        />
      )}

      {isMultiSelect && (
        <ClearSelectionSection
          trackActions={trackActions} withClose={withClose}
          Section={Section} Item={Item} Divider={Divider}
        />
      )}
    </>
  );
}
