import {
  RefreshCw,
  Lock,
  LockOpen,
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Move,
  Copy,
  MapPinOff,
  Pencil,
  Loader2,
  Save,
  Play,
  Eraser,
  ArrowDownToLine,
} from 'lucide-react';
import type { NavItem } from '@/components/ui/adaptive-nav';

export interface PanelToolbarNavItemsParams {
  playlistId: string | null;
  canEditPlaylistInfo: boolean;
  setEditDialogOpen: (open: boolean) => void;
  isReloading: boolean;
  onReload: () => void;
  hasTracks: boolean;
  onPlayFirst: (() => void) | undefined;
  isEditable: boolean;
  locked: boolean;
  panelCount: number;
  dndMode: 'move' | 'copy';
  onDndModeToggle: () => void;
  hasDuplicates: boolean;
  onDeleteDuplicates: (() => void) | undefined;
  isDeletingDuplicates: boolean;
  isSorted: boolean;
  onSaveCurrentOrder: (() => void) | undefined;
  isSavingOrder: boolean;
  insertionMarkerCount: number;
  onClearInsertionMarkers: (() => void) | undefined;
  autoScrollEnabled: boolean;
  toggleAutoScroll: () => void;
  onLockToggle: () => void;
  showSplitCommands: boolean;
  canSplitHorizontal: boolean;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  isPhone: boolean;
  isLastPanel: boolean;
  canCloseLastPanel: boolean;
  onClose: () => void;
  disableClose: boolean;
}

function addPlaylistNavItems(items: NavItem[], params: PanelToolbarNavItemsParams): void {
  const {
    playlistId,
    canEditPlaylistInfo,
    setEditDialogOpen,
    isReloading,
    onReload,
    hasTracks,
    onPlayFirst,
  } = params;

  if (canEditPlaylistInfo) {
    items.push({
      id: 'edit',
      icon: <Pencil className="h-4 w-4" />,
      label: 'Edit playlist',
      onClick: () => setEditDialogOpen(true),
      title: 'Edit playlist info',
      group: 'playlist',
    });
  }

  if (playlistId) {
    items.push({
      id: 'reload',
      icon: <RefreshCw className="h-4 w-4" />,
      label: isReloading ? 'Reloading…' : 'Reload playlist',
      onClick: onReload,
      disabled: isReloading,
      loading: isReloading,
      title: isReloading ? 'Reloading…' : 'Reload playlist',
      group: 'playlist',
    });
  }

  if (playlistId && hasTracks && onPlayFirst) {
    items.push({
      id: 'play',
      icon: <Play className="h-4 w-4" />,
      label: 'Play',
      onClick: onPlayFirst,
      title: 'Play playlist',
      group: 'playlist',
    });
  }
}

function canEditTracks(params: PanelToolbarNavItemsParams): boolean {
  return Boolean(params.playlistId && params.isEditable && !params.locked);
}

function addDragModeNavItems(items: NavItem[], params: PanelToolbarNavItemsParams): void {
  if (!canEditTracks(params) || params.panelCount <= 1) {
    return;
  }

  items.push({
    id: 'move-mode',
    icon: <Move className="h-4 w-4" />,
    label: 'Move between panels',
    onClick: () => {
      if (params.dndMode !== 'move') {
        params.onDndModeToggle();
      }
    },
    title: 'When dragging tracks to another panel, move them (removes from source)',
    group: 'drag-mode',
    showCheckmark: true,
    isActive: params.dndMode === 'move',
  });

  items.push({
    id: 'copy-mode',
    icon: <Copy className="h-4 w-4" />,
    label: 'Copy between panels',
    onClick: () => {
      if (params.dndMode !== 'copy') {
        params.onDndModeToggle();
      }
    },
    title: 'When dragging tracks to another panel, duplicate them (keeps in source)',
    group: 'drag-mode',
    showCheckmark: true,
    isActive: params.dndMode === 'copy',
  });
}

function addDeleteDuplicatesNavItem(items: NavItem[], params: PanelToolbarNavItemsParams): void {
  if (!canEditTracks(params) || !params.hasDuplicates || !params.onDeleteDuplicates) {
    return;
  }

  items.push({
    id: 'delete-duplicates',
    icon: params.isDeletingDuplicates
      ? <Loader2 className="h-4 w-4" />
      : <Eraser className="h-4 w-4" />,
    label: params.isDeletingDuplicates ? 'Removing duplicates...' : 'Delete duplicates',
    onClick: params.onDeleteDuplicates,
    disabled: params.isDeletingDuplicates,
    loading: params.isDeletingDuplicates,
    title: 'Delete duplicates',
    group: 'tracks',
  });
}

function addSaveOrderNavItem(items: NavItem[], params: PanelToolbarNavItemsParams): void {
  if (!canEditTracks(params) || !params.isSorted || !params.onSaveCurrentOrder) {
    return;
  }

  items.push({
    id: 'save-order',
    icon: params.isSavingOrder ? <Loader2 className="h-4 w-4" /> : <Save className="h-4 w-4" />,
    label: 'Save current order',
    onClick: params.onSaveCurrentOrder,
    disabled: params.isSavingOrder,
    loading: params.isSavingOrder,
    title: 'Save current order',
    group: 'tracks',
  });
}

function addClearMarkersNavItem(items: NavItem[], params: PanelToolbarNavItemsParams): void {
  if (!canEditTracks(params) || params.insertionMarkerCount <= 0 || !params.onClearInsertionMarkers) {
    return;
  }

  const markerCount = params.insertionMarkerCount;
  const markerLabel = `Clear ${markerCount} marker${markerCount > 1 ? 's' : ''}`;
  const markerTitle = `Clear ${markerCount} insertion marker${markerCount > 1 ? 's' : ''}`;

  items.push({
    id: 'clear-markers',
    icon: <MapPinOff className="h-4 w-4" />,
    label: markerLabel,
    onClick: params.onClearInsertionMarkers,
    variant: 'warning',
    badge: (
      <span className="text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
        {markerCount}
      </span>
    ),
    title: markerTitle,
    group: 'tracks',
  });
}

function addTrackNavItems(items: NavItem[], params: PanelToolbarNavItemsParams): void {
  addDragModeNavItems(items, params);
  addDeleteDuplicatesNavItem(items, params);
  addSaveOrderNavItem(items, params);
  addClearMarkersNavItem(items, params);
}

function buildClosePanelLabel(isPhone: boolean, isLastPanel: boolean, canCloseLastPanel: boolean): string {
  if (isPhone) {
    return 'Hide panel';
  }

  if (isLastPanel && !canCloseLastPanel) {
    return 'Close panel (last)';
  }

  return 'Close panel';
}

function buildClosePanelTitle(isPhone: boolean, isLastPanel: boolean, canCloseLastPanel: boolean): string {
  if (isPhone) {
    return 'Hide panel';
  }

  if (isLastPanel && canCloseLastPanel) {
    return 'Close panel and return to playlists';
  }

  if (isLastPanel && !canCloseLastPanel) {
    return 'Cannot close last panel';
  }

  return 'Close panel';
}

function addSplitNavItems(items: NavItem[], params: PanelToolbarNavItemsParams): void {
  if (!params.showSplitCommands) {
    return;
  }

  items.push({
    id: 'split-horizontal',
    icon: <SplitSquareHorizontal className="h-4 w-4" />,
    label: params.canSplitHorizontal ? 'Split horizontal' : 'Split horizontal (too narrow)',
    onClick: params.onSplitHorizontal,
    disabled: !params.canSplitHorizontal,
    title: params.canSplitHorizontal ? 'Split horizontal' : 'Panel too narrow to split',
    group: 'panel',
  });

  items.push({
    id: 'split-vertical',
    icon: <SplitSquareVertical className="h-4 w-4" />,
    label: 'Split vertical',
    onClick: params.onSplitVertical,
    title: 'Split vertical',
    group: 'panel',
  });
}

function addClosePanelNavItem(items: NavItem[], params: PanelToolbarNavItemsParams): void {
  items.push({
    id: 'close',
    icon: <X className="h-4 w-4" />,
    label: buildClosePanelLabel(params.isPhone, params.isLastPanel, params.canCloseLastPanel),
    onClick: params.onClose,
    disabled: params.disableClose,
    title: buildClosePanelTitle(params.isPhone, params.isLastPanel, params.canCloseLastPanel),
    group: 'close',
  });
}

function addPanelNavItems(items: NavItem[], params: PanelToolbarNavItemsParams): void {
  if (params.playlistId) {
    items.push({
      id: 'auto-scroll',
      icon: <ArrowDownToLine className="h-4 w-4" />,
      label: params.autoScrollEnabled ? 'Auto-scroll: On' : 'Auto-scroll: Off',
      onClick: params.toggleAutoScroll,
      showCheckmark: true,
      isActive: params.autoScrollEnabled,
      title: params.autoScrollEnabled
        ? 'Auto-scroll during playback is enabled - click to disable'
        : 'Enable auto-scroll to follow playing track',
      group: 'panel',
    });
  }

  if (params.playlistId) {
    items.push({
      id: 'lock',
      icon: params.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />,
      label: params.locked ? 'Unlock panel' : 'Lock panel',
      onClick: params.onLockToggle,
      disabled: !params.isEditable,
      title: params.locked ? 'Unlock panel' : 'Lock panel',
      group: 'panel',
    });
  }

  addSplitNavItems(items, params);
  addClosePanelNavItem(items, params);
}

export function buildPanelToolbarNavItems(params: PanelToolbarNavItemsParams): NavItem[] {
  const items: NavItem[] = [];
  addPlaylistNavItems(items, params);
  addTrackNavItems(items, params);
  addPanelNavItems(items, params);
  return items;
}