import { getPlaylistById, getPlaylistItems } from "@/lib/spotify/fetchers";

export const dynamic = "force-dynamic";

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default async function PlaylistDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;

  const playlist = await getPlaylistById(id);
  const firstPage = await getPlaylistItems(id, 100);
  const tracks = firstPage.items;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{playlist.name}</h1>
        <div className="text-sm text-muted-foreground">
          by {playlist.ownerName ?? "Unknown"} • {playlist.tracksTotal} tracks{" "}
          {playlist.isPublic ? "• Public" : "• Private"}
        </div>
      </header>

      {tracks.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">No tracks in this playlist.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="w-12 p-2 text-left">#</th>
                <th className="p-2 text-left">Title</th>
                <th className="p-2 text-left">Artists</th>
                <th className="w-24 p-2 text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((t, idx) => (
                <tr key={`${t.uri}-${idx}`} className="border-t">
                  <td className="p-2 text-muted-foreground">{idx + 1}</td>
                  <td className="p-2">{t.name}</td>
                  <td className="p-2 text-muted-foreground">{t.artists.join(", ")}</td>
                  <td className="p-2 text-right">{formatDuration(t.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end">
        {/* Step 1: show first page; pagination will be improved later */}
        <button
          className="px-3 py-1.5 text-sm rounded border bg-background hover:bg-muted disabled:opacity-50"
          disabled={!firstPage.nextCursor}
          title={firstPage.nextCursor ? "Pagination will be implemented in Step 2" : "No more results"}
        >
          Load more
        </button>
      </div>
    </div>
  );
}