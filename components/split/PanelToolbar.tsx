/**
 * PanelToolbar component for individual playlist panels.
 * Includes search, reload, lock indicator, close, and playlist selector.
 * Shows inline buttons when panel is wide (≥600px), collapses to dropdown menu when narrow.
 */

'use client';

import { useState, useRef, useEffect, ChangeEvent, useCallback } from 'react';
import { Search, RefreshCw, Lock, LockOpen, X, SplitSquareHorizontal, SplitSquareVertical, Move, Copy, Trash2, MoreHorizontal, MapPinOff, Pencil, Plus, Loader2 } from 'lucide-react';
import { PlaylistSelector } from './PlaylistSelector';
import { AddSelectedToMarkersButton } from './AddSelectedToMarkersButton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
} from '@/components/ui/alert-dialog';
import { PlaylistDialog } from '@/components/playlist/PlaylistDialog';
import { useUpdatePlaylist } from '@/lib/spotify/playlistMutations';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { useInsertionPointsStore, computeInsertionPositions } from '@/hooks/useInsertionPointsStore';
import { isLikedSongsPlaylist } from '@/hooks/useLikedVirtualPlaylist';
import { cn } from '@/lib/utils';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';
import type { SortKey, SortDirection } from '@/hooks/usePlaylistSort';

/** Minimum width (in px) to show inline buttons instead of dropdown menu */
const COMPACT_BREAKPOINT = 600;

interface PanelToolbarProps {
  panelId: string;
  playlistId: string | null;
  playlistName?: string;
  playlistDescription?: string;
  isEditable: boolean;
  locked: boolean;
  dndMode: 'move' | 'copy';
  searchQuery: string;
  isReloading?: boolean;
  sortKey?: SortKey;
  sortDirection?: SortDirection;
  selectedCount?: number;
  isDeleting?: boolean;
  insertionMarkerCount?: number;
  /** Callback to get selected track URIs for adding to markers */
  getSelectedTrackUris?: () => string[];
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
  onClearInsertionMarkers?: () => void;
}

export function PanelToolbar({
  panelId,
  playlistId,
  playlistName,
  playlistDescription,
  isEditable,
  locked,
  dndMode,
  searchQuery,
  isReloading = false,
  sortKey = 'position',
  sortDirection = 'asc',
  selectedCount = 0,
  isDeleting = false,
  insertionMarkerCount = 0,
  getSelectedTrackUris,
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
  onClearInsertionMarkers,
}: PanelToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [isCompact, setIsCompact] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isInsertingAtMarkers, setIsInsertingAtMarkers] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  
  const updatePlaylist = useUpdatePlaylist();
  const addTracksMutation = useAddTracks();
  const allPlaylists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const isLiked = playlistId ? isLikedSongsPlaylist(playlistId) : false;
  const canEditPlaylistInfo = playlistId && isEditable && !isLiked;
  
  // Calculate all playlists with markers (including current - same-playlist insertion is valid)
  const playlistsWithMarkers = Object.entries(allPlaylists)
    .filter(([, data]) => data.markers.length > 0);
  const hasAnyMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);

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

  const handleDeleteConfirm = () => {
    setDeleteDialogOpen(false);
    onDeleteSelected?.();
  };

  const handleUpdatePlaylist = useCallback(async (values: { name: string; description: string }) => {
    if (!playlistId) return;
    await updatePlaylist.mutateAsync({
      playlistId,
      name: values.name,
      description: values.description,
    });
  }, [playlistId, updatePlaylist]);

  /** Handle inserting selected tracks at all markers (for dropdown menu) */
  const handleInsertAtMarkers = useCallback(async () => {
    if (!getSelectedTrackUris || selectedCount === 0 || !hasAnyMarkers) return;
    
    setIsInsertingAtMarkers(true);
    
    try {
      const uris = await getSelectedTrackUris();
      
      if (uris.length === 0) {
        toast.error('No tracks to add');
        return;
      }
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const [targetPlaylistId, playlistData] of playlistsWithMarkers) {
        if (playlistData.markers.length === 0) continue;
        
        try {
          const positions = computeInsertionPositions(playlistData.markers, uris.length);
          
          for (const position of positions) {
            await addTracksMutation.mutateAsync({
              playlistId: targetPlaylistId,
              trackUris: uris,
              position: position.effectiveIndex,
            });
          }
          
          if (playlistData.markers.length > 1) {
            shiftAfterMultiInsert(targetPlaylistId);
          }
          
          successCount += playlistData.markers.length;
        } catch (error) {
          console.error(`Failed to add tracks to playlist ${targetPlaylistId}:`, error);
          errorCount++;
        }
      }
      
      if (successCount > 0 && errorCount === 0) {
        toast.success(`Added ${uris.length} track${uris.length > 1 ? 's' : ''} to ${successCount} marker${successCount > 1 ? 's' : ''}`);
      } else if (successCount > 0 && errorCount > 0) {
        toast.warning(`Added to ${successCount} markers, failed for ${errorCount} playlist${errorCount > 1 ? 's' : ''}`);
      } else {
        toast.error('Failed to add tracks to markers');
      }
    } catch (error) {
      console.error('Failed to insert at markers:', error);
      toast.error('Failed to add tracks');
    } finally {
      setIsInsertingAtMarkers(false);
    }
  }, [getSelectedTrackUris, selectedCount, hasAnyMarkers, playlistsWithMarkers, addTracksMutation, shiftAfterMultiInsert]);

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

          {/* Add Selected to Markers */}
          {playlistId && getSelectedTrackUris && (
            <AddSelectedToMarkersButton
              selectedCount={selectedCount}
              getTrackUris={async () => getSelectedTrackUris()}
              className="h-8 w-8 p-0 shrink-0"
            />
          )}

          {/* Delete Selected */}
          {playlistId && isEditable && !locked && selectedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isDeleting}
              onClick={() => setDeleteDialogOpen(true)}
              className="h-8 w-8 p-0 shrink-0 text-destructive hover:text-destructive"
              title={`Delete ${selectedCount} track${selectedCount > 1 ? 's' : ''}`}
            >
              <Trash2 className={cn('h-4 w-4', isDeleting && 'animate-pulse')} />
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

            {/* Edit Playlist Info */}
            {canEditPlaylistInfo && (
              <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit playlist info
              </DropdownMenuItem>
            )}

            {/* Delete Selected */}
            {playlistId && isEditable && !locked && selectedCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={isDeleting}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className={cn('h-4 w-4 mr-2', isDeleting && 'animate-pulse')} />
                  Delete {selectedCount} track{selectedCount > 1 ? 's' : ''}
                </DropdownMenuItem>
              </>
            )}

            {/* Insert at Markers */}
            {playlistId && selectedCount > 0 && hasAnyMarkers && (
              <DropdownMenuItem
                onClick={handleInsertAtMarkers}
                disabled={isInsertingAtMarkers}
                className="text-green-500 focus:text-green-600"
              >
                {isInsertingAtMarkers ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Insert {selectedCount} at markers
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

      {/* Delete confirmation dialog - controlled to prevent unmounting during re-renders */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
              onClick={handleDeleteConfirm}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit playlist dialog */}
      {canEditPlaylistInfo && (
        <PlaylistDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          mode="edit"
          initialValues={{
            name: playlistName ?? '',
            description: playlistDescription ?? '',
          }}
          onSubmit={handleUpdatePlaylist}
          isSubmitting={updatePlaylist.isPending}
        />
      )}
    </div>
  );
}
