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
 * - Lazy-loads playlist tracks for visible playlists to check membership
 */

'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import { userPlaylists, playlistTracksInfinite } from '@/lib/api/queryKeys';
import { usePlaylistTrackCheck } from '@/hooks/usePlaylistTrackCheck';
import { useAddTracks, useRemoveTracks } from '@/lib/spotify/playlistMutations';
import { useSessionUser } from '@/hooks/useSessionUser';
import { matchesAllWords } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Playlist, Track } from '@/lib/spotify/types';

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

interface PlaylistTracksPage {
  tracks: Track[];
  snapshotId: string;
  total: number;
  nextCursor: string | null;
}

// Module-level cache to track added/removed tracks until cache refresh
// Key: trackUri, Value: Map of playlistId -> boolean (true = added, false = removed)
const pendingTrackChanges = new Map<string, Map<string, boolean>>();

// Track which playlists have been checked (fetched at least first page)
// This persists across dialog close/reopen to avoid re-fetching
const checkedPlaylists = new Set<string>();

export function AddToPlaylistDialog({ isOpen, onClose, trackUri, trackName: _trackName }: AddToPlaylistDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useSessionUser();
  const { getPlaylistTrackUris, getTrackPositions } = usePlaylistTrackCheck();
  const addTracksMutation = useAddTracks();
  const removeTracksMutation = useRemoveTracks();
  const queryClient = useQueryClient();
  const [processingPlaylists, setProcessingPlaylists] = useState<Set<string>>(new Set());
  // Track playlists currently being checked (loading tracks)
  const [checkingPlaylists, setCheckingPlaylists] = useState<Set<string>>(new Set());
  // Version counter to force re-render when pending changes are mutated
  const [pendingVersion, setPendingVersion] = useState(0);
  // Track initial cache state to detect when cache has been refreshed
  const initialCacheStateRef = useRef<Set<string> | null>(null);
  // Snapshot of which playlists had the track when dialog opened (for stable sorting)
  const initialSortStateRef = useRef<Set<string> | null>(null);
  // Ref for the scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // IntersectionObserver ref
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Map of playlist ID to element ref for observation
  const playlistElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  // Queue of playlists to check - only check one at a time
  const checkQueueRef = useRef<Set<string>>(new Set());
  // Whether we're currently processing the queue
  const isProcessingQueueRef = useRef(false);

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

  // Check which playlists contain the track (from cache)
  const playlistsWithTrackFromCache = useMemo(() => {
    const result = new Set<string>();
    allPlaylists.forEach(playlist => {
      const trackUris = getPlaylistTrackUris(playlist.id);
      if (trackUris.has(trackUri)) {
        result.add(playlist.id);
      }
    });
    return result;
  }, [allPlaylists, trackUri, getPlaylistTrackUris]);

  // Combine cache state with pending changes (pendingVersion triggers recalc on mutations)
  const playlistsWithTrack = useMemo(() => {
    const result = new Set(playlistsWithTrackFromCache);
    const pendingChangesForTrack = pendingTrackChanges.get(trackUri);
    if (pendingChangesForTrack) {
      pendingChangesForTrack.forEach((hasTrack, playlistId) => {
        if (hasTrack) {
          result.add(playlistId);
        } else {
          result.delete(playlistId);
        }
      });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistsWithTrackFromCache, trackUri, pendingVersion]);

  // Clear pending changes for playlists where cache now reflects the change
  useEffect(() => {
    const pendingChangesForTrack = pendingTrackChanges.get(trackUri);
    if (!pendingChangesForTrack || pendingChangesForTrack.size === 0) return;
    
    // Store initial state on first render
    if (initialCacheStateRef.current === null) {
      initialCacheStateRef.current = new Set(playlistsWithTrackFromCache);
      return;
    }
    
    // Check if cache has updated for any pending changes
    const playlistsToRemove: string[] = [];
    pendingChangesForTrack.forEach((expectedHasTrack, playlistId) => {
      const cacheHasTrack = playlistsWithTrackFromCache.has(playlistId);
      const initialHadTrack = initialCacheStateRef.current?.has(playlistId) ?? false;
      
      // If cache now matches expected state and differs from initial, remove pending change
      if (cacheHasTrack === expectedHasTrack && cacheHasTrack !== initialHadTrack) {
        playlistsToRemove.push(playlistId);
      }
    });
    
    if (playlistsToRemove.length > 0) {
      playlistsToRemove.forEach(id => pendingChangesForTrack.delete(id));
      if (pendingChangesForTrack.size === 0) {
        pendingTrackChanges.delete(trackUri);
      }
      setPendingVersion(v => v + 1);
    }
  }, [playlistsWithTrackFromCache, trackUri, pendingVersion]);

  // Reset initial cache state ref when dialog opens
  useEffect(() => {
    if (isOpen) {
      initialCacheStateRef.current = null;
    }
  }, [isOpen]);

  // Process the check queue - only one playlist at a time
  const processCheckQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || checkQueueRef.current.size === 0) {
      return;
    }

    isProcessingQueueRef.current = true;

    // Get next playlist from queue
    const playlistId = checkQueueRef.current.values().next().value;
    if (!playlistId) {
      isProcessingQueueRef.current = false;
      return;
    }
    checkQueueRef.current.delete(playlistId);

    // Skip if already checked
    if (checkedPlaylists.has(playlistId)) {
      isProcessingQueueRef.current = false;
      // Process next item
      setTimeout(() => processCheckQueue(), 0);
      return;
    }

    // Check if we already have cached data
    const cachedData = queryClient.getQueryData(playlistTracksInfinite(playlistId));
    if (cachedData) {
      checkedPlaylists.add(playlistId);
      setPendingVersion(v => v + 1);
      isProcessingQueueRef.current = false;
      setTimeout(() => processCheckQueue(), 0);
      return;
    }

    // Start checking
    setCheckingPlaylists(prev => new Set(prev).add(playlistId));

    try {
      // Fetch first page of tracks
      const firstPage = await apiFetch<PlaylistTracksPage>(
        `/api/playlists/${playlistId}/tracks`
      );
      
      // Store in query cache
      queryClient.setQueryData(playlistTracksInfinite(playlistId), {
        pages: [firstPage],
        pageParams: [null],
      });

      checkedPlaylists.add(playlistId);
      setPendingVersion(v => v + 1);
    } catch (error) {
      console.error(`[AddToPlaylistDialog] Failed to check playlist ${playlistId}:`, error);
      checkedPlaylists.add(playlistId);
    } finally {
      setCheckingPlaylists(prev => {
        const next = new Set(prev);
        next.delete(playlistId);
        return next;
      });
      isProcessingQueueRef.current = false;
      // Process next item after a small delay
      setTimeout(() => processCheckQueue(), 50);
    }
  }, [queryClient]);

  // Add a playlist to the check queue
  const queuePlaylistCheck = useCallback((playlistId: string) => {
    if (checkedPlaylists.has(playlistId) || checkQueueRef.current.has(playlistId)) {
      return;
    }
    checkQueueRef.current.add(playlistId);
    processCheckQueue();
  }, [processCheckQueue]);

  // Set up IntersectionObserver to lazy-load playlist tracks when visible
  useEffect(() => {
    if (!isOpen) return;

    // Clear queue when dialog opens
    checkQueueRef.current.clear();
    isProcessingQueueRef.current = false;

    // Create observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const playlistId = entry.target.getAttribute('data-playlist-id');
            if (playlistId && !checkedPlaylists.has(playlistId)) {
              // Add to queue - will be processed one at a time
              queuePlaylistCheck(playlistId);
            }
          }
        });
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '0px', // Only check when actually visible
        threshold: 0.1, // Must be at least 10% visible
      }
    );

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      // Clear queue on cleanup
      // eslint-disable-next-line react-hooks/exhaustive-deps
      checkQueueRef.current.clear();
      isProcessingQueueRef.current = false;
    };
  }, [isOpen, queuePlaylistCheck]);

  // Register/unregister playlist elements with observer
  const registerPlaylistElement = useCallback((playlistId: string, element: HTMLElement | null) => {
    const observer = observerRef.current;
    const prevElement = playlistElementsRef.current.get(playlistId);
    
    // Unobserve previous element
    if (prevElement && observer) {
      observer.unobserve(prevElement);
    }
    
    if (element) {
      playlistElementsRef.current.set(playlistId, element);
      if (observer) {
        observer.observe(element);
      }
    } else {
      playlistElementsRef.current.delete(playlistId);
    }
  }, []);

  // Check if a playlist's status is known (has been checked)
  const isPlaylistStatusKnown = useCallback((playlistId: string): boolean => {
    // If we have pending changes for this track+playlist, we know the status
    const pendingChangesForTrack = pendingTrackChanges.get(trackUri);
    if (pendingChangesForTrack?.has(playlistId)) {
      return true;
    }
    // Otherwise, check if playlist tracks have been loaded
    return checkedPlaylists.has(playlistId);
  }, [trackUri]);

  // Capture initial sort state when dialog opens (for stable sorting)
  useEffect(() => {
    if (isOpen && allPlaylists.length > 0 && initialSortStateRef.current === null) {
      // Snapshot which playlists have the track at dialog open time
      const snapshot = new Set<string>();
      allPlaylists.forEach(playlist => {
        const trackUris = getPlaylistTrackUris(playlist.id);
        if (trackUris.has(trackUri)) {
          snapshot.add(playlist.id);
        }
        // Also include pending changes
        const pendingChangesForTrack = pendingTrackChanges.get(trackUri);
        if (pendingChangesForTrack?.get(playlist.id) === true) {
          snapshot.add(playlist.id);
        } else if (pendingChangesForTrack?.get(playlist.id) === false) {
          snapshot.delete(playlist.id);
        }
      });
      initialSortStateRef.current = snapshot;
    }
  }, [isOpen, allPlaylists, trackUri, getPlaylistTrackUris]);

  // Reset sort state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      initialSortStateRef.current = null;
    }
  }, [isOpen]);

  // Filter and sort playlists (sort is stable based on initial state)
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

    // Use initial sort state for stable ordering (prevents list jumping)
    const sortState = initialSortStateRef.current ?? playlistsWithTrack;

    // Sort: playlists with track first, then alphabetically
    return [...filtered].sort((a, b) => {
      const aHasTrack = sortState.has(a.id);
      const bHasTrack = sortState.has(b.id);
      
      if (aHasTrack && !bHasTrack) return -1;
      if (!aHasTrack && bHasTrack) return 1;
      
      return a.name.localeCompare(b.name);
    });
  }, [allPlaylists, searchQuery, playlistsWithTrack]);

  const handleToggleTrack = async (playlist: Playlist, containsTrack: boolean) => {
    setProcessingPlaylists(prev => new Set(prev).add(playlist.id));
    
    // Optimistically update pending changes immediately (persists across dialog close/reopen)
    const trackChanges = pendingTrackChanges.get(trackUri) ?? new Map<string, boolean>();
    trackChanges.set(playlist.id, !containsTrack);
    pendingTrackChanges.set(trackUri, trackChanges);
    setPendingVersion(v => v + 1);
    
    try {
      if (containsTrack) {
        // Get track positions for removal
        const positions = getTrackPositions(playlist.id, [trackUri]);
        
        // Remove track from playlist using correct format
        await removeTracksMutation.mutateAsync({
          playlistId: playlist.id,
          tracks: [{
            uri: trackUri,
            positions: positions.length > 0 ? positions.map(p => p.position) : undefined,
          }],
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
      // Revert optimistic update on error
      const changes = pendingTrackChanges.get(trackUri);
      if (changes) {
        changes.delete(playlist.id);
        if (changes.size === 0) {
          pendingTrackChanges.delete(trackUri);
        }
      }
      setPendingVersion(v => v + 1);
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
          <DialogDescription>
            Search and select a playlist to add this track to. Playlists already containing the track show a checkmark.
          </DialogDescription>
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
        <div ref={scrollContainerRef} className="max-h-96 overflow-y-auto space-y-1">
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
              const isChecking = checkingPlaylists.has(playlist.id);
              const statusKnown = isPlaylistStatusKnown(playlist.id);
              const isEditable = user?.id && playlist.owner?.id === user.id;

              return (
                <button
                  key={playlist.id}
                  ref={(el) => registerPlaylistElement(playlist.id, el)}
                  data-playlist-id={playlist.id}
                  onClick={() => isEditable && !isProcessing && !isChecking && statusKnown && handleToggleTrack(playlist, containsTrack)}
                  disabled={!isEditable || isProcessing || isChecking || !statusKnown}
                  className={cn(
                    "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                    isEditable && !isProcessing && !isChecking && statusKnown && "hover:bg-muted",
                    (!isEditable || isProcessing || isChecking || !statusKnown) && "opacity-50 cursor-not-allowed"
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

                  {/* Action button / Status indicator */}
                  {isProcessing || isChecking ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground flex-shrink-0" />
                  ) : !statusKnown ? (
                    // Status unknown - waiting to check
                    <div className="h-6 w-6 flex items-center justify-center text-muted-foreground/50 flex-shrink-0">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
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
