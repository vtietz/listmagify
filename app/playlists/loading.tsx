"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useCompactModeStore } from "@/hooks/useCompactModeStore";

export default function PlaylistsLoading() {
  const { isCompact } = useCompactModeStore();
  
  // More items in compact mode since they're smaller
  const itemCount = isCompact ? 15 : 10;
  
  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-24" />
      </header>

      {isCompact ? (
        /* Compact mode: List view matching PlaylistListItem layout */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
          {Array.from({ length: itemCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              {/* Small cover image */}
              <Skeleton className="w-10 h-10 flex-shrink-0 rounded" />
              
              {/* Playlist info */}
              <div className="flex-1 min-w-0 space-y-1">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Normal mode: Card grid matching PlaylistCard layout */
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: itemCount }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square rounded-t-lg" />
              <div className="space-y-1 px-3 pb-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
