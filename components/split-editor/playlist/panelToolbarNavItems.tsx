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

function addTrackNavItems(items: NavItem[], params: PanelToolbarNavItemsParams): void {
  const {
    playlistId,
    isEditable,
    locked,
    panelCount,
    dndMode,
    onDndModeToggle,
    hasDuplicates,
    onDeleteDuplicates,
    isDeletingDuplicates,
    isSorted,
    onSaveCurrentOrder,
    isSavingOrder,
    insertionMarkerCount,
    onClearInsertionMarkers,
  } = params;

  if (playlistId && isEditable && !locked && panelCount > 1) {
    items.push({
      id: 'move-mode',
      icon: <Move className="h-4 w-4" />,
      label: 'Move between panels',
      onClick: () => {
        if (dndMode !== 'move') {
          onDndModeToggle();
        }
      },
      title: 'When dragging tracks to another panel, move them (removes from source)',
      group: 'drag-mode',
      showCheckmark: true,
      isActive: dndMode === 'move',
    });

    items.push({
      id: 'copy-mode',
      icon: <Copy className="h-4 w-4" />,
      label: 'Copy between panels',
      onClick: () => {
        if (dndMode !== 'copy') {
          onDndModeToggle();
        }
      },
      title: 'When dragging tracks to another panel, duplicate them (keeps in source)',
      group: 'drag-mode',
      showCheckmark: true,
      isActive: dndMode === 'copy',
    });
  }

  if (playlistId && isEditable && !locked && hasDuplicates && onDeleteDuplicates) {
    items.push({
      id: 'delete-duplicates',
      icon: isDeletingDuplicates
        ? <Loader2 className="h-4 w-4" />
        : <Eraser className="h-4 w-4" />,
      label: isDeletingDuplicates ? 'Removing duplicates...' : 'Delete duplicates',
      onClick: onDeleteDuplicates,
      disabled: isDeletingDuplicates,
      loading: isDeletingDuplicates,
      title: 'Delete duplicates',
      group: 'tracks',
    });
  }

  if (playlistId && isEditable && !locked && isSorted && onSaveCurrentOrder) {
    items.push({
      id: 'save-order',
      icon: isSavingOrder ? <Loader2 className="h-4 w-4" /> : <Save className="h-4 w-4" />,
      label: 'Save current order',
      onClick: onSaveCurrentOrder,
      disabled: isSavingOrder,
      loading: isSavingOrder,
      title: 'Save current order',
      group: 'tracks',
    });
  }

  if (playlistId && isEditable && !locked && insertionMarkerCount > 0 && onClearInsertionMarkers) {
    items.push({
      id: 'clear-markers',
      icon: <MapPinOff className="h-4 w-4" />,
      label: `Clear ${insertionMarkerCount} marker${insertionMarkerCount > 1 ? 's' : ''}`,
      onClick: onClearInsertionMarkers,
      variant: 'warning',
      badge: (
        <span className="text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
          {insertionMarkerCount}
        </span>
      ),
      title: `Clear ${insertionMarkerCount} insertion marker${insertionMarkerCount > 1 ? 's' : ''}`,
      group: 'tracks',
    });
  }
}

function addPanelNavItems(items: NavItem[], params: PanelToolbarNavItemsParams): void {
  const {
    autoScrollEnabled,
    toggleAutoScroll,
    playlistId,
    locked,
    onLockToggle,
    isEditable,
    showSplitCommands,
    canSplitHorizontal,
    onSplitHorizontal,
    onSplitVertical,
    isPhone,
    isLastPanel,
    onClose,
    disableClose,
  } = params;

  items.push({
    id: 'auto-scroll',
    icon: <ArrowDownToLine className="h-4 w-4" />,
    label: autoScrollEnabled ? 'Auto-scroll: On' : 'Auto-scroll: Off',
    onClick: toggleAutoScroll,
    showCheckmark: true,
    isActive: autoScrollEnabled,
    title: autoScrollEnabled
      ? 'Auto-scroll during playback is enabled - click to disable'
      : 'Enable auto-scroll to follow playing track',
    group: 'panel',
  });

  if (playlistId) {
    items.push({
      id: 'lock',
      icon: locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />,
      label: locked ? 'Unlock panel' : 'Lock panel',
      onClick: onLockToggle,
      disabled: !isEditable,
      title: locked ? 'Unlock panel' : 'Lock panel',
      group: 'panel',
    });
  }

  if (showSplitCommands) {
    items.push({
      id: 'split-horizontal',
      icon: <SplitSquareHorizontal className="h-4 w-4" />,
      label: canSplitHorizontal ? 'Split horizontal' : 'Split horizontal (too narrow)',
      onClick: onSplitHorizontal,
      disabled: !canSplitHorizontal,
      title: canSplitHorizontal ? 'Split horizontal' : 'Panel too narrow to split',
      group: 'panel',
    });

    items.push({
      id: 'split-vertical',
      icon: <SplitSquareVertical className="h-4 w-4" />,
      label: 'Split vertical',
      onClick: onSplitVertical,
      title: 'Split vertical',
      group: 'panel',
    });
  }

  items.push({
    id: 'close',
    icon: <X className="h-4 w-4" />,
    label: isPhone ? 'Hide panel' : (isLastPanel ? 'Close panel (last)' : 'Close panel'),
    onClick: onClose,
    disabled: disableClose,
    title: isPhone ? 'Hide panel' : (isLastPanel ? 'Cannot close last panel' : 'Close panel'),
    group: 'close',
  });
}

export function buildPanelToolbarNavItems(params: PanelToolbarNavItemsParams): NavItem[] {
  const items: NavItem[] = [];
  addPlaylistNavItems(items, params);
  addTrackNavItems(items, params);
  addPanelNavItems(items, params);
  return items;
}