/**
 * PanelToolbar component for individual playlist panels.
 * Includes search, reload, lock indicator, close, and playlist selector.
 * Shows inline buttons when panel is wide (≥600px), collapses to dropdown menu when narrow.
 */

'use client';

import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { Search, RefreshCw, Lock, LockOpen, X, SplitSquareHorizontal, SplitSquareVertical, Move, Copy, Trash2, MoreHorizontal } from 'lucide-react';
import { PlaylistSelector } from './PlaylistSelector';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { SortKey, SortDirection } from '@/hooks/usePlaylistSort';

/** Minimum width (in px) to show inline buttons instead of dropdown menu */
const COMPACT_BREAKPOINT = 600;

interface PanelToolbarProps {
  panelId: string;
  playlistId: string | null;
  playlistName?: string;
  isEditable: boolean;
  locked: boolean;
  dndMode: 'move' | 'copy';
  searchQuery: string;
  isReloading?: boolean;
  sortKey?: SortKey;
  sortDirection?: SortDirection;
  selectedCount?: number;
  isDeleting?: boolean;
  onSearchChange: (query: string) => void;
  onSortChange?: (key: SortKey, direction: SortDirection) => void;
  onReload: () => void;
  onClose: () => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onDndModeToggle: () => void;
  onLockToggle: () => void;
  onLoadPlaylist: (playlistId: string) => void;
  onDeleteSelected?: () => void;
}

export function PanelToolbar({
  panelId,
  playlistId,
  playlistName,
  isEditable,
  locked,
  dndMode,
  searchQuery,
  isReloading = false,
  sortKey = 'position',
  sortDirection = 'asc',
  selectedCount = 0,
  isDeleting = false,
  onSearchChange,
  onSortChange,
  onReload,
  onClose,
  onSplitHorizontal,
  onSplitVertical,
  onDndModeToggle,
  onLockToggle,
  onLoadPlaylist,
  onDeleteSelected,
}: PanelToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [isCompact, setIsCompact] = useState(true);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Track toolbar width to toggle between compact (dropdown) and expanded (inline buttons) mode
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < COMPACT_BREAKPOINT);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    onSearchChange(value);
  };

  // Delete confirmation dialog (shared between inline and dropdown)
  const DeleteDialog = ({ trigger }: { trigger: React.ReactNode }) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {selectedCount} track{selectedCount > 1 ? 's' : ''}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove {selectedCount} track{selectedCount > 1 ? 's' : ''} from the playlist. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDeleteSelected}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <div ref={toolbarRef} className="flex items-center gap-1.5 p-1.5 border-b border-border bg-card relative z-20">
      {/* Playlist selector - max 50% width */}
      <div className="shrink-0 max-w-[50%]">
        <PlaylistSelector
          selectedPlaylistId={playlistId}
          selectedPlaylistName={playlistName ?? ''}
          onSelectPlaylist={onLoadPlaylist}
        />
      </div>

      {/* Search - grows to fill space */}
      {playlistId && (
        <div className="relative flex-1 min-w-[60px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search..."
            value={localSearch}
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      )}

      {/* Inline buttons when panel is wide enough */}
      {!isCompact && (
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

          {/* Delete Selected */}
          {playlistId && isEditable && !locked && selectedCount > 0 && (
            <DeleteDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isDeleting}
                  className="h-8 w-8 p-0 shrink-0 text-destructive hover:text-destructive"
                  title={`Delete ${selectedCount} track${selectedCount > 1 ? 's' : ''}`}
                >
                  <Trash2 className={cn('h-4 w-4', isDeleting && 'animate-pulse')} />
                </Button>
              }
            />
          )}

          <Separator orientation="vertical" className="h-6 mx-0.5" />

          {/* Split Horizontal */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSplitHorizontal}
            className="h-8 w-8 p-0 shrink-0"
            title="Split horizontal"
          >
            <SplitSquareHorizontal className="h-4 w-4" />
          </Button>

          {/* Split Vertical */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSplitVertical}
            className="h-8 w-8 p-0 shrink-0"
            title="Split vertical"
          >
            <SplitSquareVertical className="h-4 w-4" />
          </Button>

          {/* Close */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 shrink-0"
            title="Close panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      )}

      {/* Compact: Dropdown menu with all actions */}
      {isCompact && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              title="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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

            {/* Delete Selected */}
            {playlistId && isEditable && !locked && selectedCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <DeleteDialog
                  trigger={
                    <DropdownMenuItem
                      onSelect={(e: Event) => e.preventDefault()}
                      disabled={isDeleting}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className={cn('h-4 w-4 mr-2', isDeleting && 'animate-pulse')} />
                      Delete {selectedCount} track{selectedCount > 1 ? 's' : ''}
                    </DropdownMenuItem>
                  }
                />
              </>
            )}

            {playlistId && <DropdownMenuSeparator />}

            {/* Split actions */}
            <DropdownMenuItem onClick={onSplitHorizontal}>
              <SplitSquareHorizontal className="h-4 w-4 mr-2" />
              Split horizontal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSplitVertical}>
              <SplitSquareVertical className="h-4 w-4 mr-2" />
              Split vertical
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Close */}
            <DropdownMenuItem onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Close panel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
