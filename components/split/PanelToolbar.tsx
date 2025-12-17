/**
 * PanelToolbar component for individual playlist panels.
 * Includes search, reload, lock indicator, close, and playlist selector.
 */

'use client';

import { useState, ChangeEvent } from 'react';
import { Search, RefreshCw, Lock, LockOpen, X, SplitSquareHorizontal, SplitSquareVertical, Move, Copy, ArrowUpDown, Trash2 } from 'lucide-react';
import { PlaylistSelector } from './PlaylistSelector';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    // Debounce is handled by the parent component
    onSearchChange(value);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 border-b border-border bg-card relative z-20">
      {/* Left side - Playlist selector and search */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {/* Playlist selector */}
        <div className="flex-1 min-w-[80px] max-w-[180px]">
          <PlaylistSelector
            selectedPlaylistId={playlistId}
            selectedPlaylistName={playlistName ?? ''}
            onSelectPlaylist={onLoadPlaylist}
          />
        </div>

        {/* Sort indicator */}
        {playlistId && sortKey !== 'position' && (
          <div className="flex items-center gap-1 px-2 h-8 text-xs text-muted-foreground border border-border rounded whitespace-nowrap">
            <ArrowUpDown className="h-3 w-3" />
            <span>Sorted by {sortKey}</span>
          </div>
        )}

        {/* Search */}
        {playlistId && (
          <div className="relative flex-1 min-w-[60px] max-w-[120px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search..."
              value={localSearch}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        )}
      </div>

      {/* Right side - Action buttons group */}
      {playlistId && (
        <div className="flex items-center gap-1 shrink-0">
          {/* Reload */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onReload}
            className="h-8 w-8 p-0"
            title={isReloading ? 'Reloading…' : 'Reload playlist'}
            disabled={isReloading}
          >
            <RefreshCw className={cn('h-4 w-4', isReloading && 'animate-spin')} />
            <span className="sr-only">Reload playlist</span>
          </Button>

          {/* DnD Mode Toggle (only when editable and not locked) */}
          {isEditable && !locked && (
            <Button
              variant={dndMode === 'move' ? 'default' : 'outline'}
              size="sm"
              onClick={onDndModeToggle}
              className="h-8 w-8 p-0"
              title={`Drag mode: ${dndMode === 'move' ? 'Move (remove from source)' : 'Copy (keep in source)'}`}
            >
              {dndMode === 'move' ? (
                <Move className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="sr-only">{dndMode === 'move' ? 'Move mode' : 'Copy mode'}</span>
            </Button>
          )}

          {/* Lock Toggle */}
          <Button
            variant={locked ? 'default' : 'outline'}
            size="sm"
            onClick={onLockToggle}
            disabled={!isEditable}
            className="h-8 w-8 p-0"
            title={
              !isEditable 
                ? 'Playlist is read-only (always locked)'
                : locked 
                  ? 'Locked (click to unlock dragging)' 
                  : 'Unlocked (click to prevent dragging from this panel)'
            }
          >
            {locked ? (
              <Lock className="h-4 w-4" />
            ) : (
              <LockOpen className="h-4 w-4" />
            )}
            <span className="sr-only">{locked ? 'Locked' : 'Unlocked'}</span>
          </Button>

          {/* Delete Selected Tracks */}
          {isEditable && selectedCount > 0 && (
            selectedCount === 1 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDeleteSelected}
                disabled={isDeleting}
                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Delete selected track"
              >
                <Trash2 className={cn('h-4 w-4', isDeleting && 'animate-pulse')} />
                <span className="sr-only">Delete selected track</span>
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title={`Delete ${selectedCount} selected tracks`}
                  >
                    <Trash2 className={cn('h-4 w-4', isDeleting && 'animate-pulse')} />
                    <span className="sr-only">Delete selected tracks</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedCount} tracks?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove {selectedCount} tracks from the playlist. This action cannot be undone.
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
            )
          )}
        </div>
      )}

      {/* Layout controls group */}
      <div className="flex items-center gap-1 shrink-0">
        <Separator orientation="vertical" className="h-6" />

        {/* Split buttons */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onSplitHorizontal}
          className="h-8 w-8 p-0"
          title="Split Horizontal"
        >
          <SplitSquareHorizontal className="h-4 w-4" />
          <span className="sr-only">Split Horizontal</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onSplitVertical}
          className="h-8 w-8 p-0"
          title="Split Vertical"
        >
          <SplitSquareVertical className="h-4 w-4" />
          <span className="sr-only">Split Vertical</span>
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Close */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0"
          title="Close panel"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close panel</span>
        </Button>
      </div>
    </div>
  );
}
