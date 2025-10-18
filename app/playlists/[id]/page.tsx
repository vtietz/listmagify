import { redirect } from "next/navigation";
import { getPlaylistById, getPlaylistItems } from "@/lib/spotify/fetchers";
import { PlaylistDetail } from "@/components/playlist/PlaylistDetail";
import { spotifyFetch } from "@/lib/spotify/client";

export const dynamic = "force-dynamic";

/**
 * Server-rendered playlist detail page with SSR data.
 * Passes initial tracks, snapshot_id, and nextCursor for infinite scroll.
 * Gracefully handles 401 errors by redirecting to login.
 */
export default async function PlaylistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const playlist = await getPlaylistById(id);
    
    // Fetch tracks with snapshot_id and next cursor for infinite scroll
    const fields = "items(track(id,uri,name,artists(name),duration_ms,album(id,name,images)),added_at),snapshot_id,next";
    const path = `/playlists/${encodeURIComponent(id)}/tracks?limit=100&fields=${encodeURIComponent(fields)}`;
    
    const res = await spotifyFetch(path, { method: "GET" });
    const raw = await res.json();
    
    const firstPage = await getPlaylistItems(id, 100);
    const snapshotId = raw?.snapshot_id ?? null;
    
    // Extract cursor from Spotify's next URL if present
    const nextUrl = raw?.next as string | null;
    const nextCursor = nextUrl
      ? new URL(nextUrl).searchParams.get("offset") ?? null
      : null;

    return (
      <PlaylistDetail
        playlist={playlist}
        initialTracks={firstPage.items}
        initialSnapshotId={snapshotId}
        initialNextCursor={nextCursor}
      />
    );
  } catch (error) {
    // Handle 401 Unauthorized - token expired or invalid
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized") || errorMessage.includes("access token expired")) {
      console.warn("[playlist-detail] Token expired, redirecting to login");
      redirect("/login?reason=expired");
    }
    
    // Re-throw other errors
    throw error;
  }
}