'use client';

import { Check, Plus, Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { PlayingIndicator } from '@/components/ui/playing-indicator';
import { cn } from '@/lib/utils';
import type { Playlist } from '@/lib/music-provider/types';

type PlaylistListItem = Playlist | { kind: 'separator' };

interface AddToPlaylistDialogPlaylistListProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  allPlaylistsCount: number;
  filteredPlaylists: PlaylistListItem[];
  playlistsWithTrack: Set<string>;
  processingPlaylists: Set<string>;
  checkingPlaylists: Set<string>;
  currentPlaybackPlaylistId: string | null;
  userId: string | undefined;
  isPlaylistStatusKnown: (playlistId: string) => boolean;
  registerPlaylistElement: (playlistId: string, element: HTMLElement | null) => void;
  handleToggleTrack: (playlist: Playlist, containsTrack: boolean) => void;
  isFetchingNextPage: boolean;
}

export function AddToPlaylistDialogPlaylistList({
  scrollContainerRef,
  isLoading,
  allPlaylistsCount,
  filteredPlaylists,
  playlistsWithTrack,
  processingPlaylists,
  checkingPlaylists,
  currentPlaybackPlaylistId,
  userId,
  isPlaylistStatusKnown,
  registerPlaylistElement,
  handleToggleTrack,
  isFetchingNextPage,
}: AddToPlaylistDialogPlaylistListProps) {
  return (
    <div ref={scrollContainerRef} className="max-h-96 overflow-y-auto space-y-1">
      {isLoading && allPlaylistsCount === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading playlists...
        </div>
      ) : filteredPlaylists.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No playlists found
        </div>
      ) : (
        filteredPlaylists.map((item, index) => {
          if ('kind' in item && item.kind === 'separator') {
            return (
              <div key={`separator-${index}`} className="py-2">
                <Separator />
              </div>
            );
          }

          const playlist = item as Playlist;
          const containsTrack = playlistsWithTrack.has(playlist.id);
          const isProcessing = processingPlaylists.has(playlist.id);
          const isChecking = checkingPlaylists.has(playlist.id);
          const statusKnown = isPlaylistStatusKnown(playlist.id);
          const isEditable = Boolean(userId && playlist.owner?.id === userId);

          return (
            <button
              key={playlist.id}
              ref={(el) => registerPlaylistElement(playlist.id, el)}
              data-playlist-id={playlist.id}
              onClick={(e) => {
                e.stopPropagation();
                if (isEditable && !isProcessing && !isChecking && statusKnown) {
                  handleToggleTrack(playlist, containsTrack);
                }
              }}
              disabled={!isEditable || isProcessing || isChecking || !statusKnown}
              className={cn(
                'w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors',
                isEditable && !isProcessing && !isChecking && statusKnown && 'hover:bg-muted',
                (!isEditable || isProcessing || isChecking || !statusKnown) && 'opacity-50 cursor-not-allowed'
              )}
            >
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

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {currentPlaybackPlaylistId === playlist.id && (
                    <PlayingIndicator size="sm" />
                  )}
                  <div className="font-medium truncate">{playlist.name}</div>
                </div>
                <div className="text-sm text-muted-foreground truncate">
                  {playlist.ownerName || 'Unknown'}
                </div>
              </div>

              {isProcessing || isChecking ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground flex-shrink-0" />
              ) : !statusKnown ? (
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

      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading more...
        </div>
      )}
    </div>
  );
}
