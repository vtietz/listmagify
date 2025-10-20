/**
 * Drag-and-drop type definitions for cross-panel track operations.
 */

export interface TrackDragData {
  type: 'track';
  trackIds: string[];
  trackUris: string[];
  sourcePlaylistId: string;
  sourcePanelId: string;
  sourceIndices: number[];
}

export interface DropResult {
  targetPanelId: string;
  targetPlaylistId: string;
  targetIndex: number;
  mode: 'move' | 'copy';
}

export function createDragData(
  trackIds: string[],
  trackUris: string[],
  sourcePlaylistId: string,
  sourcePanelId: string,
  sourceIndices: number[]
): TrackDragData {
  return {
    type: 'track',
    trackIds,
    trackUris,
    sourcePlaylistId,
    sourcePanelId,
    sourceIndices,
  };
}

export function isDragData(data: unknown): data is TrackDragData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    data.type === 'track' &&
    'trackIds' in data &&
    'trackUris' in data &&
    'sourcePlaylistId' in data &&
    'sourcePanelId' in data &&
    'sourceIndices' in data
  );
}
