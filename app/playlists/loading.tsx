"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useCompactModeStore } from "@/hooks/useCompactModeStore";
import { cn } from "@/lib/utils";

export default function PlaylistsLoading() {
  const { isCompact } = useCompactModeStore();
  
  // More items in compact mode since they're smaller
  const itemCount = isCompact ? 20 : 10;
  
  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-24" />
      </header>

      <div className={cn(
        "grid",
        isCompact 
          ? "grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2" 
          : "grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
      )}>
        {Array.from({ length: itemCount }).map((_, i) => (
          <div key={i} className={cn("space-y-2", isCompact && "space-y-1")}>
            <Skeleton className="aspect-square rounded-lg" />
            <div className={cn("space-y-2", isCompact && "space-y-1")}>
              <Skeleton className={cn("w-full", isCompact ? "h-3" : "h-4")} />
              <Skeleton className={cn("w-2/3", isCompact ? "h-2" : "h-3")} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
