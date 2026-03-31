import { Skeleton } from "@/components/ui/skeleton";

/**
 * Playlists loading skeleton.
 *
 * Renders BOTH compact and non-compact variants simultaneously.
 * A blocking inline script in root layout sets the `compact` class on <html>
 * before first paint, so CSS instantly shows the correct variant with zero flash.
 */
export default function PlaylistsLoading() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-24" />
      </header>

      {/* Compact mode: hidden by default, shown when html.compact */}
      <div className="hidden compact:block">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="w-10 h-10 flex-shrink-0 rounded" />
              <div className="flex-1 min-w-0 space-y-1">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Normal mode: shown by default, hidden when html.compact */}
      <div className="block compact:hidden">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square rounded-t-lg" />
              <div className="space-y-1 px-3 pb-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
