import { SinglePlaylistView } from "@/components/split-editor/SinglePlaylistView";

export const dynamic = "force-dynamic";

/**
 * Playlist detail page - renders single panel split view for consistent editing experience.
 * The panel will fetch playlist data and permissions on mount.
 */
export default async function PlaylistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="h-full">
      <SinglePlaylistView playlistId={id} />
    </div>
  );
}