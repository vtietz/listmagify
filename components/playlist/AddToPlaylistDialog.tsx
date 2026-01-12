/**
 * AddToPlaylistDialog - Spotify-style dialog for adding tracks to playlists.
 * 
 * Features:
 * - Search bar to filter playlists
 * - Shows all user's playlists (excluding Liked Songs)
 * - Sorts playlists containing the track to the top
 * - Green checkmark for playlists already containing the track
 * - Plus icon for playlists that don't contain the track
 * - Click checkmark to remove track, plus to add track
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Check, Plus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import { userPlaylists } from '@/lib/api/queryKeys';
import { usePlaylistTrackCheck } from '@/hooks/usePlaylistTrackCheck';
import { useAddTracks, useRemoveTracks } from '@/lib/spotify/playlistMutations';
import { useSessionUser } from '@/hooks/useSessionUser';
import { matchesAllWords } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Playlist } from '@/lib/spotify/types';

interface AddToPlaylistDialogProps {
  isOpen: boolean;
  onClose: () => void;
  trackUri: string;
  trackName: string;
}

interface PlaylistsResponse {
  items: Playlist[];
  nextCursor: string | null;
  total: number | null;
}

export function AddToPlaylistDialog({ isOpen, onClose, trackUri, trackName: _trackName }: AddToPlaylistDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useSessionUser();
  const { getPlaylistTrackUris } = usePlaylistTrackCheck();
  const addTracksMutation = useAddTracks();
  const removeTracksMutation = useRemoveTracks();
  const [processingPlaylists, setProcessingPlaylists] = useState<Set<string>>(new Set());

  // Fetch all user's playlists
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: userPlaylists(),
    queryFn: async ({ pageParam }: { pageParam: string | null }): Promise<PlaylistsResponse> => {
      const url = pageParam
        ? `/api/me/playlists?nextCursor=${encodeURIComponent(pageParam)}`
        : '/api/me/playlists';
      return apiFetch<PlaylistsResponse>(url);
    },
    getNextPageParam: (lastPage: PlaylistsResponse) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    staleTime: 60_000,
    enabled: isOpen, // Only fetch when dialog is open
  });

  // Auto-load all playlists when dialog opens
  useEffect(() => {
    if (isOpen && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [isOpen, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten all pages into single array
  const allPlaylists = useMemo(() => {
    if (!data?.pages) return [];
    const all = data.pages.flatMap((p: PlaylistsResponse) => p.items);
    // Deduplicate by playlist ID
    const seen = new Set<string>();
    return all.filter((p: Playlist) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [data]);

  // Check which playlists contain the track
  const playlistsWithTrack = useMemo(() => {
    const result = new Set<string>();
    allPlaylists.forEach(playlist => {
      const trackUris = getPlaylistTrackUris(playlist.id);
      if (trackUris.has(trackUri)) {
        result.add(playlist.id);
      }
    });
    return result;
  }, [allPlaylists, trackUri, getPlaylistTrackUris]);

  // Filter and sort playlists
  const filteredPlaylists = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    
    let filtered = allPlaylists;
    
    // Apply search filter
    if (query) {
      filtered = filtered.filter(p => 
        matchesAllWords(p.name, query) || 
        (p.ownerName && matchesAllWords(p.ownerName, query))
      );
    }

    // Sort: playlists with track first, then alphabetically
    return [...filtered].sort((a, b) => {
      const aHasTrack = playlistsWithTrack.has(a.id);
      const bHasTrack = playlistsWithTrack.has(b.id);
      
      if (aHasTrack && !bHasTrack) return -1;
      if (!aHasTrack && bHasTrack) return 1;
      
      return a.name.localeCompare(b.name);
    });
  }, [allPlaylists, searchQuery, playlistsWithTrack]);

  const handleToggleTrack = async (playlist: Playlist, containsTrack: boolean) => {
    setProcessingPlaylists(prev => new Set(prev).add(playlist.id));
    
    try {
      if (containsTrack) {
        // Remove track from playlist
        await removeTracksMutation.mutateAsync({
          playlistId: playlist.id,
          trackUris: [trackUri],
        });
      } else {
        // Add track to end of playlist
        await addTracksMutation.mutateAsync({
          playlistId: playlist.id,
          trackUris: [trackUri],
          position: undefined, // Add to end
        });
      }
    } catch (error) {
      console.error('[AddToPlaylistDialog] Failed to toggle track:', error);
    } finally {
      setProcessingPlaylists(prev => {
        const next = new Set(prev);
        next.delete(playlist.id);
        return next;
      });
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to playlist</DialogTitle>
        </DialogHeader>

        {/* Search bar */}
        <Input
          autoFocus
          type="text"
          placeholder="Search playlists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-4"
        />

        {/* Playlists list */}
        <div className="max-h-96 overflow-y-auto space-y-1">
          {isLoading && allPlaylists.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading playlists...
            </div>
          ) : filteredPlaylists.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No playlists found
            </div>
          ) : (
            filteredPlaylists.map((playlist) => {
              const containsTrack = playlistsWithTrack.has(playlist.id);
              const isProcessing = processingPlaylists.has(playlist.id);
              const isEditable = user?.id && playlist.owner?.id === user.id;

              return (
                <button
                  key={playlist.id}
                  onClick={() => isEditable && !isProcessing && handleToggleTrack(playlist, containsTrack)}
                  disabled={!isEditable || isProcessing}
                  className={cn(
                    "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                    isEditable && !isProcessing && "hover:bg-muted",
                    (!isEditable || isProcessing) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {/* Playlist image */}
                  <div className="w-12 h-12 rounded bg-muted flex-shrink-0 overflow-hidden">
                    {playlist.image?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={playlist.image.url}
                        alt={playlist.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        No cover
                      </div>
                    )}
                  </div>

                  {/* Playlist info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{playlist.name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {playlist.ownerName || 'Unknown'}
                    </div>
                  </div>

                  {/* Action button */}
                  {isProcessing ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground flex-shrink-0" />
                  ) : containsTrack ? (
                    <div className="h-6 w-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  ) : (
                    <div className="h-6 w-6 flex items-center justify-center text-muted-foreground flex-shrink-0">
                      <Plus className="h-5 w-5" />
                    </div>
                  )}
                </button>
              );
            })
          )}

          {/* Loading more indicator */}
          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading more...
            </div>
          )}
        </div>

        {/* Close button */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
