import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api/client";
import type { QueryClient } from "@tanstack/react-query";

interface PaginatedResponse<T> {
  items?: T[];
  tracks?: T[];
  nextCursor?: string | null;
}

function defaultKeyForItem(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const anyItem = item as { uri?: unknown; id?: unknown };
  if (typeof anyItem.uri === 'string') return anyItem.uri;
  if (typeof anyItem.id === 'string') return anyItem.id;
  return null;
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
  /** Optional: TanStack Query client for cache synchronization */
  queryClient?: QueryClient;
  /** Optional: Query key to update in cache */
  cacheQueryKey?: unknown[];
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
  queryClient,
  cacheQueryKey,
}: UseAutoLoadPaginatedOptions<T>): UseAutoLoadPaginatedResult<T> {
  const [items, setItems] = useState<T[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isAutoLoading, setIsAutoLoading] = useState(false);

  const initialItemsRef = useRef<T[]>(initialItems);
  const initialNextCursorRef = useRef<string | null>(initialNextCursor);

  // Guard against re-running auto-load for the same resetToken
  const lastRunTokenRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  // Stable token to drive resets without changing dependency array size
  const resetToken = `${resetKey ?? ""}::${initialNextCursor ?? ""}::${initialItems?.length ?? 0}`;

  // Reset state when resetKey changes (e.g., loading a different playlist)
  useEffect(() => {
    initialItemsRef.current = initialItems;
    initialNextCursorRef.current = initialNextCursor;
    setItems(initialItems);
    setNextCursor(initialNextCursor);
    setIsAutoLoading(false);

    // New dataset: allow a new auto-load run
    lastRunTokenRef.current = null;
    inFlightRef.current = false;
  }, [resetToken]);

  useEffect(() => {
    // Only kick off when enabled and we have a cursor.
    // Do NOT depend on stateful `nextCursor/items`, otherwise the effect can
    // restart on every state update and loop.
    // IMPORTANT: only start when `nextCursor` is set. After a successful run
    // we set `nextCursor` to null, which prevents re-starting even if the
    // parent keeps passing a non-null initialNextCursor.
    const startCursor = nextCursor;
    if (!enabled || !startCursor || !endpoint) return;
    if (inFlightRef.current) return;
    if (lastRunTokenRef.current === resetToken) return;

    const autoLoadAll = async () => {
      inFlightRef.current = true;
      lastRunTokenRef.current = resetToken;
      setIsAutoLoading(true);

      try {
        let currentCursor: string | null = startCursor;
        let allItems = [...initialItemsRef.current];

        while (currentCursor) {
          const data: PaginatedResponse<T> = await apiFetch<PaginatedResponse<T>>(
            `${endpoint}?nextCursor=${encodeURIComponent(currentCursor)}`
          );

          const newItems = data[itemsKey] || [];
          // Defensive de-dupe: some backends can return overlapping pages while
          // data is mutating (e.g., reorders). Prefer keeping first occurrence.
          const seen = new Set<string>();
          for (const item of allItems) {
            const key = defaultKeyForItem(item);
            if (key) seen.add(key);
          }
          const toAppend: T[] = [];
          for (const item of newItems) {
            const key = defaultKeyForItem(item);
            if (!key) {
              toAppend.push(item);
              continue;
            }
            if (seen.has(key)) continue;
            seen.add(key);
            toAppend.push(item);
          }

          allItems = [...allItems, ...toAppend];
          setItems(allItems); // Progressive UI update
          currentCursor = data.nextCursor ?? null;
        }

        setNextCursor(null); // All data loaded
        
        // Sync final full track list back to TanStack Query cache
        if (queryClient && cacheQueryKey) {
          const currentCache = queryClient.getQueryData(cacheQueryKey) as any;
          if (currentCache) {
            queryClient.setQueryData(cacheQueryKey, {
              ...currentCache,
              tracks: allItems,
            });
          }
        }
      } catch (error) {
        // Silently fail - user still has initial items
        console.warn(`[useAutoLoadPaginated] Auto-load failed for ${endpoint}:`, error);
      } finally {
        setIsAutoLoading(false);
        inFlightRef.current = false;
      }
    };

    autoLoadAll();
  }, [enabled, endpoint, itemsKey, resetToken, initialNextCursor, initialItems, nextCursor, items, queryClient, cacheQueryKey]);

  return {
    items,
    nextCursor,
    isAutoLoading,
    setItems,
    setNextCursor: (cursor) => {
      // Allow a manual cursor change to trigger an auto-load run.
      // This is primarily for refresh / testing flows; guardrails still
      // protect against repeated loops for the same resetToken.
      lastRunTokenRef.current = null;
      setNextCursor(cursor);
    },
  };
}
