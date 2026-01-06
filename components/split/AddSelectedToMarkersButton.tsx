/**
 * AddSelectedToMarkersButton - Unified button to add selected tracks to all insertion markers
 * 
 * Used in:
 * - Playlist panels (adds selected tracks to markers in other playlists)
 * - Spotify search panel (adds selected search results to markers)
 * - Last.fm browse panel (matches then adds selected tracks to markers)
 */

'use client';

import { useState, useCallback } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useInsertionPointsStore, computeInsertionPositions } from '@/hooks/useInsertionPointsStore';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { cn } from '@/lib/utils';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';

interface AddSelectedToMarkersButtonProps {
  /** Number of selected tracks to add */
  selectedCount: number;
  /** Get the track URIs to add - called when button is clicked */
  getTrackUris: () => Promise<string[]> | string[];
  /** Optional: playlist ID to exclude from markers (e.g., the source playlist) */
  excludePlaylistId?: string;
  /** Optional: custom class name */
  className?: string;
}

export function AddSelectedToMarkersButton({
  selectedCount,
  getTrackUris,
  excludePlaylistId,
  className,
}: AddSelectedToMarkersButtonProps) {
  const [isAdding, setIsAdding] = useState(false);
  
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const addTracksMutation = useAddTracks();
  
  // Get all playlists with active markers (excluding source playlist)
  const playlistsWithMarkers = Object.entries(playlists)
    .filter(([playlistId, data]) => 
      data.markers.length > 0 && playlistId !== excludePlaylistId
    );
  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);
  
  const handleClick = useCallback(async () => {
    if (selectedCount === 0 || !hasActiveMarkers) return;
    
    setIsAdding(true);
    
    try {
      // Get track URIs (may be async for Last.fm matching)
      const uris = await getTrackUris();
      
      if (uris.length === 0) {
        toast.error('No tracks to add');
        return;
      }
      
      // Add to each playlist's markers
      let successCount = 0;
      let errorCount = 0;
      
      for (const [playlistId, playlistData] of playlistsWithMarkers) {
        if (playlistData.markers.length === 0) continue;
        
        try {
          // Compute insertion positions accounting for shifts
          const positions = computeInsertionPositions(
            playlistData.markers,
            uris.length
          );
          
          // Insert at each position
          for (const position of positions) {
            await addTracksMutation.mutateAsync({
              playlistId,
              trackUris: uris,
              position: position.effectiveIndex,
            });
          }
          
          // Update markers to account for inserted tracks
          if (playlistData.markers.length > 1) {
            shiftAfterMultiInsert(playlistId);
          }
          
          successCount += playlistData.markers.length;
        } catch (error) {
          console.error(`Failed to add tracks to playlist ${playlistId}:`, error);
          errorCount++;
        }
      }
      
      // Show result toast
      if (successCount > 0 && errorCount === 0) {
        // Success - no toast needed
      } else if (successCount > 0 && errorCount > 0) {
        toast.warning(
          `Added to ${successCount} markers, failed for ${errorCount} playlist${errorCount > 1 ? 's' : ''}`
        );
      } else {
        toast.error('Failed to add tracks to markers');
      }
    } catch (error) {
      console.error('Failed to add selected tracks:', error);
      toast.error('Failed to add tracks');
    } finally {
      setIsAdding(false);
    }
  }, [selectedCount, hasActiveMarkers, getTrackUris, playlistsWithMarkers, addTracksMutation, shiftAfterMultiInsert]);
  
  const isDisabled = !hasActiveMarkers || isAdding || selectedCount === 0;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClick}
            disabled={isDisabled}
            className={cn(
              'h-8 w-8 p-0 shrink-0 relative',
              hasActiveMarkers && selectedCount > 0 && 'text-green-500 hover:text-green-600 hover:bg-green-500/10',
              (!hasActiveMarkers || selectedCount === 0) && 'text-muted-foreground',
              className
            )}
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {/* Badge showing selected count - only when there's a selection */}
            {selectedCount > 0 && (
              <span 
                className={cn(
                  'absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center',
                  hasActiveMarkers 
                    ? 'bg-green-500 text-white' 
                    : 'bg-muted-foreground/50 text-background'
                )}
              >
                {selectedCount > 99 ? '99+' : selectedCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {selectedCount === 0 ? (
            <p>Select tracks to add to insertion markers</p>
          ) : hasActiveMarkers ? (
            <p>Add {selectedCount} track{selectedCount > 1 ? 's' : ''} to {totalMarkers} marker{totalMarkers > 1 ? 's' : ''}</p>
          ) : (
            <p>No insertion markers set. Right-click track rows to add markers.</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
