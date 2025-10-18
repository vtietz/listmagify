import { getCurrentUserPlaylists } from "@/lib/spotify/fetchers";
import { PlaylistsContainer } from "@/components/playlist/PlaylistsContainer";

export const dynamic = "force-dynamic";

/**
 * Playlists index page with SSR initial data and client-side infinite scroll.
 * 
 * Features:
 * - Server-rendered initial playlists for fast loading
 * - Client-side search filtering
 * - Infinite scroll with automatic loading
 * - Refresh button to re-fetch from Spotify
 */
export default async function PlaylistsPage() {
  const page = await getCurrentUserPlaylists(50);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your Playlists</h1>
        <span className="text-sm text-muted-foreground">
          {page.total ?? page.items.length} {page.total === 1 ? "playlist" : "playlists"}
        </span>
      </header>

      <PlaylistsContainer
        initialItems={page.items}
        initialNextCursor={page.nextCursor}
      />
    </div>
  );
}