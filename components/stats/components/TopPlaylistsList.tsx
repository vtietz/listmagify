import type { TopPlaylist } from '../types';

interface TopPlaylistsListProps {
  playlists: TopPlaylist[];
}

export function TopPlaylistsList({ playlists }: TopPlaylistsListProps) {
  if (playlists.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No playlist interactions
      </div>
    );
  }
  
  const maxInteractions = Math.max(...playlists.map(p => p.interactions));
  
  return (
    <div className="space-y-2">
      {playlists.slice(0, 5).map((p, i) => (
        <div key={p.playlistId} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
          <div className="flex-1">
            <div
              className="bg-primary/20 rounded h-6 flex items-center px-2"
              style={{ width: `${(p.interactions / maxInteractions) * 100}%` }}
            >
              <span className="text-xs truncate">{p.playlistId.slice(0, 8)}...</span>
            </div>
          </div>
          <span className="text-sm font-medium">{p.interactions}</span>
        </div>
      ))}
    </div>
  );
}
