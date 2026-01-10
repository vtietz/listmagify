import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
} from 'lucide-react';

import type { ReorderActions } from './types';

export type MenuItemDef = {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  action?: (() => void) | undefined;
  destructive?: boolean;
};

export function pluralizeTrack(count: number) {
  return count === 1 ? 'track' : 'tracks';
}

export function removeSelectedLabel(selectedCount: number) {
  return `Remove ${selectedCount} ${pluralizeTrack(selectedCount)}`;
}

export function markerBeforeLabel(hasMarkerBefore: boolean | undefined, useSelectionWording: boolean) {
  if (hasMarkerBefore) return useSelectionWording ? 'Remove marker above selection' : 'Remove marker before';
  return useSelectionWording ? 'Add marker above selection' : 'Add marker before';
}

export function markerAfterLabel(hasMarkerAfter: boolean | undefined, useSelectionWording: boolean) {
  if (hasMarkerAfter) return useSelectionWording ? 'Remove marker below selection' : 'Remove marker after';
  return useSelectionWording ? 'Add marker below selection' : 'Add marker after';
}

export function buildReorderItems(reorderActions: ReorderActions | undefined): MenuItemDef[] {
  return [
    { key: 'move-up', icon: ChevronUp, label: 'Move up', action: reorderActions?.onMoveUp },
    { key: 'move-down', icon: ChevronDown, label: 'Move down', action: reorderActions?.onMoveDown },
    { key: 'move-top', icon: ChevronsUp, label: 'Move to top', action: reorderActions?.onMoveToTop },
    { key: 'move-bottom', icon: ChevronsDown, label: 'Move to bottom', action: reorderActions?.onMoveToBottom },
  ];
}

export function hasAnyAction(items: MenuItemDef[]) {
  return items.some((i) => !!i.action);
}
