import { getCurrentUserPlaylists } from "@/lib/spotify/fetchers";
import { PlaylistCard } from "@/components/playlist/PlaylistCard";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const page = await getCurrentUserPlaylists(50);
  const playlists = page.items;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your Playlists</h1>
        <span className="text-sm text-muted-foreground">
          {playlists.length} of {page.total ?? playlists.length}
        </span>
      </header>

      {playlists.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {playlists.map((pl) => (
            <PlaylistCard key={pl.id} playlist={pl} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border bg-muted/30 p-8 text-center">
      <p className="text-sm text-muted-foreground">
        No playlists found. Create a playlist in Spotify and come back.
      </p>
    </div>
  );
}