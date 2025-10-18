import { redirect } from "next/navigation";
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
 * - Graceful 401 handling: redirects to login if token expired/invalid
 */
export default async function PlaylistsPage() {
  try {
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
  } catch (error) {
    // Handle 401 Unauthorized - token expired or invalid
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized") || errorMessage.includes("access token expired")) {
      console.warn("[playlists] Token expired, redirecting to login");
      redirect("/login?reason=expired");
    }
    
    // Re-throw other errors
    throw error;
  }
}