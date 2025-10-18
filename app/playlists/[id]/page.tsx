import { getPlaylistById, getPlaylistItems } from "@/lib/spotify/fetchers";
import { PlaylistDetail } from "@/components/playlist/PlaylistDetail";
import { spotifyFetch } from "@/lib/spotify/client";

export const dynamic = "force-dynamic";

/**
 * Server-rendered playlist detail page with SSR data.
 * Passes initial tracks and snapshot_id to the interactive PlaylistDetail component.
 */
export default async function PlaylistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const playlist = await getPlaylistById(id);
  
  // Fetch tracks with snapshot_id for optimistic concurrency
  const fields = "items(track(id,uri,name,artists(name),duration_ms,album(id,name,images)),added_at),snapshot_id";
  const path = `/playlists/${encodeURIComponent(id)}/tracks?limit=100&fields=${encodeURIComponent(fields)}`;
  
  const res = await spotifyFetch(path, { method: "GET" });
  const raw = await res.json();
  
  const firstPage = await getPlaylistItems(id, 100);
  const snapshotId = raw?.snapshot_id ?? null;

  return (
    <PlaylistDetail
      playlist={playlist}
      initialTracks={firstPage.items}
      initialSnapshotId={snapshotId}
    />
  );
}