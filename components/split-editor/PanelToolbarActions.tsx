/**
 * Extracted toolbar action components for PanelToolbar.
 * Reduces complexity by splitting inline buttons and dropdown menu items into separate components.
 */

'use client';

import { RefreshCw, Lock, LockOpen, X, SplitSquareHorizontal, SplitSquareVertical, Move, Copy, MapPinOff, Pencil, Loader2, Save, ListChecks, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { PlaylistSelector } from './PlaylistSelector';
import { cn } from '@/lib/utils';
import type { ChangeEvent } from 'react';

export interface ToolbarActionProps {
  playlistId: string | null;
  playlistName?: string | undefined;
  isEditable: boolean;
  locked: boolean;
  dndMode: 'move' | 'copy';
  isReloading: boolean;
  isSorted: boolean;
  isSavingOrder: boolean;
  insertionMarkerCount: number;
  selectionCount: number;
  canSplitHorizontal: boolean;
  disableClose: boolean;
  isLastPanel: boolean;
  isPhone: boolean;
  showSplitCommands: boolean;
  canEditPlaylistInfo: boolean;
  onReload: () => void;
  onDndModeToggle: () => void;
  onLockToggle: () => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onClose: () => void;
  onClearInsertionMarkers?: (() => void) | undefined;
  onSaveCurrentOrder?: (() => void) | undefined;
  onEditPlaylist: () => void;
  onSelectionMenuClick: (e: React.MouseEvent) => void;
}

/** Inline toolbar buttons (for wide panels) */
export function InlineToolbarActions({
  playlistId,
  isEditable,
  locked,
  dndMode,
  isReloading,
  isSorted,
  isSavingOrder,
  insertionMarkerCount,
  canSplitHorizontal,
  disableClose,
  isLastPanel,
  isPhone,
  showSplitCommands,
  canEditPlaylistInfo,
  onReload,
  onDndModeToggle,
  onLockToggle,
  onSplitHorizontal,
  onSplitVertical,
  onClose,
  onClearInsertionMarkers,
  onSaveCurrentOrder,
  onEditPlaylist,
}: Omit<ToolbarActionProps, 'selectionCount' | 'onSelectionMenuClick'>) {
  return (
    <>
      {/* Reload */}
      {playlistId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReload}
          disabled={isReloading}
          className="h-8 w-8 p-0 shrink-0"
          title={isReloading ? 'Reloading…' : 'Reload playlist'}
        >
          <RefreshCw className={cn('h-4 w-4', isReloading && 'animate-spin')} />
        </Button>
      )}

      {/* DnD Mode Toggle */}
      {playlistId && isEditable && !locked && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDndModeToggle}
          className="h-8 w-8 p-0 shrink-0"
          title={dndMode === 'move' ? 'Mode: Move (click to switch to Copy)' : 'Mode: Copy (click to switch to Move)'}
        >
          {dndMode === 'move' ? <Move className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      )}

      {/* Lock Toggle */}
      {playlistId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onLockToggle}
          disabled={!isEditable}
          className="h-8 w-8 p-0 shrink-0"
          title={locked ? 'Unlock panel' : 'Lock panel'}
        >
          {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        </Button>
      )}

      {/* Edit Playlist Info */}
      {canEditPlaylistInfo && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onEditPlaylist}
          className="h-8 w-8 p-0 shrink-0"
          title="Edit playlist info"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}

      {/* Save Current Order */}
      {playlistId && isEditable && !locked && isSorted && onSaveCurrentOrder && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSaveCurrentOrder}
          disabled={isSavingOrder}
          className="h-8 w-8 p-0 shrink-0"
          title="Save current order"
        >
          {isSavingOrder ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
        </Button>
      )}

      {/* Clear Insertion Markers */}
      {playlistId && isEditable && !locked && insertionMarkerCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearInsertionMarkers}
          className="h-8 w-8 p-0 shrink-0 text-orange-500 hover:text-orange-600"
          title={`Clear ${insertionMarkerCount} insertion marker${insertionMarkerCount > 1 ? 's' : ''}`}
        >
          <MapPinOff className="h-4 w-4" />
        </Button>
      )}

      {/* Split commands */}
      {showSplitCommands && (
        <>
          <Separator orientation="vertical" className="h-6 mx-0.5" />

          <Button
            variant="ghost"
            size="sm"
            onClick={onSplitHorizontal}
            disabled={!canSplitHorizontal}
            className={cn("h-8 w-8 p-0 shrink-0", !canSplitHorizontal && "opacity-40")}
            title={canSplitHorizontal ? "Split horizontal" : "Panel too narrow to split"}
          >
            <SplitSquareHorizontal className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onSplitVertical}
            className="h-8 w-8 p-0 shrink-0"
            title="Split vertical"
          >
            <SplitSquareVertical className="h-4 w-4" />
          </Button>
        </>
      )}

      {/* Close */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        disabled={disableClose}
        className={cn("h-8 w-8 p-0 shrink-0", disableClose && "opacity-40")}
        title={isPhone ? "Hide panel" : (isLastPanel ? "Cannot close last panel" : "Close panel")}
      >
        <X className="h-4 w-4" />
      </Button>
    </>
  );
}

export interface DropdownActionProps extends ToolbarActionProps {
  isUltraCompact: boolean;
  localSearch: string;
  onSearchChange: (value: string) => void;
  onLoadPlaylist: (playlistId: string) => void;
  onOpenSelectionMenu?: ((position: { x: number; y: number }) => void) | undefined;
}

/** Dropdown menu items (for compact panels) */
export function DropdownToolbarActions({
  playlistId,
  playlistName,
  isEditable,
  locked,
  dndMode,
  isReloading,
  isSorted,
  isSavingOrder,
  insertionMarkerCount,
  selectionCount,
  canSplitHorizontal,
  disableClose,
  isLastPanel,
  isPhone,
  showSplitCommands,
  canEditPlaylistInfo,
  isUltraCompact,
  localSearch,
  onReload,
  onDndModeToggle,
  onLockToggle,
  onSplitHorizontal,
  onSplitVertical,
  onClose,
  onClearInsertionMarkers,
  onSaveCurrentOrder,
  onEditPlaylist,
  onSelectionMenuClick,
  onSearchChange,
  onLoadPlaylist,
  onOpenSelectionMenu,
}: DropdownActionProps) {
  return (
    <>
      {/* Ultra-compact mode: Playlist selector in dropdown */}
      {isUltraCompact && (
        <>
          <div className="px-2 py-1.5">
            <PlaylistSelector
              selectedPlaylistId={playlistId}
              selectedPlaylistName={playlistName ?? ''}
              onSelectPlaylist={onLoadPlaylist}
            />
          </div>
          {playlistId && (
            <div className="px-2 py-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search..."
                  value={localSearch}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
            </div>
          )}
          <DropdownMenuSeparator />
        </>
      )}

      {/* Selection Actions - in ultra-compact mode */}
      {isUltraCompact && playlistId && onOpenSelectionMenu && (
        <>
          <DropdownMenuItem
            onClick={selectionCount > 0 ? onSelectionMenuClick : undefined}
            disabled={selectionCount === 0}
          >
            <ListChecks className="h-4 w-4 mr-2" />
            Selection actions
            {selectionCount > 0 && (
              <span className="text-xs font-medium bg-orange-500 text-white px-1.5 py-0.5 rounded-full ml-auto">
                {selectionCount}
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}

      {/* Reload */}
      {playlistId && (
        <DropdownMenuItem onClick={onReload} disabled={isReloading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isReloading && 'animate-spin')} />
          {isReloading ? 'Reloading…' : 'Reload playlist'}
        </DropdownMenuItem>
      )}

      {/* DnD Mode Toggle */}
      {playlistId && isEditable && !locked && (
        <DropdownMenuItem onClick={onDndModeToggle}>
          {dndMode === 'move' ? (
            <>
              <Move className="h-4 w-4 mr-2" />
              Mode: Move
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Mode: Copy
            </>
          )}
        </DropdownMenuItem>
      )}

      {/* Lock Toggle */}
      {playlistId && (
        <DropdownMenuItem onClick={onLockToggle} disabled={!isEditable}>
          {locked ? (
            <>
              <Lock className="h-4 w-4 mr-2" />
              Unlock panel
            </>
          ) : (
            <>
              <LockOpen className="h-4 w-4 mr-2" />
              Lock panel
            </>
          )}
        </DropdownMenuItem>
      )}

      {/* Edit Playlist Info */}
      {canEditPlaylistInfo && (
        <DropdownMenuItem onClick={onEditPlaylist}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit playlist info
        </DropdownMenuItem>
      )}

      {/* Save Current Order */}
      {playlistId && isEditable && !locked && isSorted && onSaveCurrentOrder && (
        <DropdownMenuItem 
          onClick={onSaveCurrentOrder}
          disabled={isSavingOrder}
        >
          {isSavingOrder ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save current order
        </DropdownMenuItem>
      )}

      {/* Clear Insertion Markers */}
      {playlistId && isEditable && !locked && insertionMarkerCount > 0 && (
        <DropdownMenuItem onClick={onClearInsertionMarkers} className="text-orange-500 focus:text-orange-600">
          <MapPinOff className="h-4 w-4 mr-2" />
          Clear {insertionMarkerCount} marker{insertionMarkerCount > 1 ? 's' : ''}
        </DropdownMenuItem>
      )}

      {playlistId && <DropdownMenuSeparator />}

      {/* Split actions */}
      {showSplitCommands && (
        <>
          <DropdownMenuItem 
            onClick={canSplitHorizontal ? onSplitHorizontal : undefined}
            disabled={!canSplitHorizontal}
            className={cn(!canSplitHorizontal && "opacity-40 cursor-not-allowed")}
          >
            <SplitSquareHorizontal className="h-4 w-4 mr-2" />
            Split horizontal
            {!canSplitHorizontal && <span className="text-xs text-muted-foreground ml-auto">(too narrow)</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSplitVertical}>
            <SplitSquareVertical className="h-4 w-4 mr-2" />
            Split vertical
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}

      {/* Close */}
      <DropdownMenuItem 
        onClick={disableClose ? undefined : onClose}
        disabled={disableClose}
        className={cn(disableClose && "opacity-40 cursor-not-allowed")}
      >
        <X className="h-4 w-4 mr-2" />
        {isPhone ? "Hide panel" : "Close panel"}
        {isLastPanel && !isPhone && <span className="text-xs text-muted-foreground ml-auto">(last panel)</span>}
      </DropdownMenuItem>
    </>
  );
}

/** Selection actions button */
export function SelectionButton({
  selectionCount,
  onClick,
  buttonRef,
}: {
  selectionCount: number;
  onClick: (e: React.MouseEvent) => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={selectionCount === 0}
      className={cn(
        "h-8 px-2 shrink-0 gap-1",
        selectionCount > 0 ? "text-foreground hover:text-foreground" : "text-muted-foreground"
      )}
      title={selectionCount > 0 
        ? `${selectionCount} track${selectionCount > 1 ? 's' : ''} selected - click for actions`
        : 'No tracks selected'
      }
    >
      <ListChecks className="h-4 w-4" />
      {selectionCount > 1 && (
        <span className="text-xs font-medium bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
          {selectionCount}
        </span>
      )}
    </Button>
  );
}
