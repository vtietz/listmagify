import type * as React from 'react';
import { InsertionMarkerLine } from '../../TrackRowCells';
import { InsertionToggleButton } from '../../TrackRowActions';

interface InsertionControlsProps {
  hasInsertionMarker: boolean;
  hasInsertionMarkerAfter: boolean;
  isEditable: boolean;
  locked: boolean;
  allowInsertionMarkerToggle: boolean;
  nearEdge: 'top' | 'bottom' | null;
  isCompact: boolean;
  index: number;
  onToggle: (e: React.MouseEvent) => void;
}

export function InsertionControls({
  hasInsertionMarker,
  hasInsertionMarkerAfter,
  isEditable,
  locked,
  allowInsertionMarkerToggle,
  nearEdge,
  isCompact,
  index,
  onToggle,
}: InsertionControlsProps) {
  return (
    <>
      {hasInsertionMarker && <InsertionMarkerLine position="top" />}
      {hasInsertionMarkerAfter && <InsertionMarkerLine position="bottom" />}

      {isEditable && !locked && allowInsertionMarkerToggle && nearEdge !== null && (
        <InsertionToggleButton
          isCompact={isCompact}
          edge={nearEdge}
          hasMarker={nearEdge === 'bottom' ? hasInsertionMarkerAfter : hasInsertionMarker}
          rowIndex={index}
          onClick={onToggle}
        />
      )}
    </>
  );
}
