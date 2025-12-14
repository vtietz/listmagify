import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api/client";

interface PaginatedResponse<T> {
  items?: T[];
  tracks?: T[];
  nextCursor?: string | null;
}

interface UseAutoLoadPaginatedOptions<T> {
  /** Initial items from server-side rendering */
  initialItems: T[];
  /** Initial cursor for pagination */
  initialNextCursor: string | null;
  /** API endpoint to fetch from */
  endpoint: string;
  /** Response key containing items ("items" or "tracks") */
  itemsKey?: "items" | "tracks";
  /** Whether to enable auto-loading (default: true) */
  enabled?: boolean;
  /** Reset the hook when this value changes (e.g., new playlist) */
  resetKey?: string | number | null;
}

interface UseAutoLoadPaginatedResult<T> {
  /** All loaded items (progressively updated) */
  items: T[];
  /** Current pagination cursor */
  nextCursor: string | null;
  /** Whether auto-loading is in progress */
  isAutoLoading: boolean;
  /** Manually set items (for refresh) */
  setItems: (items: T[]) => void;
  /** Manually set cursor (for refresh) */
  setNextCursor: (cursor: string | null) => void;
}

/**
 * Auto-loads all pages of paginated data on mount for instant client-side search.
 * 
 * This hook fetches all remaining pages in the background when a component mounts,
 * progressively updating the UI as data loads. This enables instant search across
 * the entire dataset without requiring infinite scroll.
 * 
 * @example
 * ```tsx
 * const { items, isAutoLoading } = useAutoLoadPaginated({
 *   initialItems: serverPlaylists,
 *   initialNextCursor: serverNextCursor,
 *   endpoint: "/api/me/playlists",
 *   itemsKey: "items"
 * });
 * ```
 */
export function useAutoLoadPaginated<T>({
  initialItems,
  initialNextCursor,
  endpoint,
  itemsKey = "items",
  enabled = true,
  resetKey = endpoint ?? null,
}: UseAutoLoadPaginatedOptions<T>): UseAutoLoadPaginatedResult<T> {
  const [items, setItems] = useState<T[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isAutoLoading, setIsAutoLoading] = useState(false);

  // Stable token to drive resets without changing dependency array size
  const resetToken = `${resetKey ?? ""}::${initialNextCursor ?? ""}::${initialItems?.length ?? 0}`;

  // Reset state when resetKey changes (e.g., loading a different playlist)
  useEffect(() => {
    setItems(initialItems);
    setNextCursor(initialNextCursor);
    setIsAutoLoading(false);
  }, [resetToken]);

  useEffect(() => {
    if (!enabled || !nextCursor || !endpoint) {
      return; // Auto-load disabled or all data already loaded
    }

    const autoLoadAll = async () => {
      setIsAutoLoading(true);

      try {
        let currentCursor: string | null = nextCursor;
        let allItems = [...items];

        while (currentCursor) {
          const data: PaginatedResponse<T> = await apiFetch<PaginatedResponse<T>>(
            `${endpoint}?nextCursor=${encodeURIComponent(currentCursor)}`
          );

          const newItems = data[itemsKey] || [];
          allItems = [...allItems, ...newItems];
          setItems(allItems); // Progressive UI update
          currentCursor = data.nextCursor ?? null;
        }

        setNextCursor(null); // All data loaded
      } catch (error) {
        // Silently fail - user still has initial items
        console.warn(`[useAutoLoadPaginated] Auto-load failed for ${endpoint}:`, error);
      } finally {
        setIsAutoLoading(false);
      }
    };

    autoLoadAll();
  }, [enabled, endpoint, itemsKey, nextCursor, resetToken]);

  return {
    items,
    nextCursor,
    isAutoLoading,
    setItems,
    setNextCursor,
  };
}
