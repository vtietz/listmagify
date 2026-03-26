/**
 * Track context menu public API.
 *
 * This file is intentionally small: the implementation lives under
 * `components/split-editor/context-menu/` to keep responsibilities separated.
 */

'use client';

export { TrackContextMenu } from './context-menu/TrackContextMenu';
export { ContextMenuTrigger } from './context-menu/ContextMenuTrigger';

export type {
  ReorderActions,
  MarkerActions,
  TrackActions,
  RecommendationActions,
  PendingActions,
  PendingResolveOption,
} from './context-menu/types';

export { useTrackContextMenu } from '@/hooks/useTrackContextMenu';
