import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAutoLoadPaginated } from "@/hooks/useAutoLoadPaginated";
import * as apiClient from "@/lib/api/client";

// Mock the API client
vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
}));

describe("useAutoLoadPaginated", () => {
  const mockApiFetch = vi.mocked(apiClient.apiFetch);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns initial items when no cursor provided", () => {
    const initialItems = [{ id: "1", name: "Item 1" }];

    const { result } = renderHook(() =>
      useAutoLoadPaginated({
        initialItems,
        initialNextCursor: null,
        endpoint: "/api/items",
        itemsKey: "items",
      })
    );

    expect(result.current.items).toEqual(initialItems);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.isAutoLoading).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("auto-loads all pages when cursor provided", async () => {
    const initialItems = [{ id: "1", name: "Item 1" }];
    const page2Items = [{ id: "2", name: "Item 2" }];
    const page3Items = [{ id: "3", name: "Item 3" }];

    // Mock API responses for pagination
    mockApiFetch
      .mockResolvedValueOnce({
        items: page2Items,
        nextCursor: "cursor3",
      })
      .mockResolvedValueOnce({
        items: page3Items,
        nextCursor: null, // Last page
      });

    const { result } = renderHook(() =>
      useAutoLoadPaginated({
        initialItems,
        initialNextCursor: "cursor2",
        endpoint: "/api/items",
        itemsKey: "items",
      })
    );

    // Initially shows loading state
    expect(result.current.isAutoLoading).toBe(true);

    // Wait for auto-loading to complete
    await waitFor(() => {
      expect(result.current.isAutoLoading).toBe(false);
    });

    // Should have loaded all pages
    expect(result.current.items).toEqual([
      { id: "1", name: "Item 1" },
      { id: "2", name: "Item 2" },
      { id: "3", name: "Item 3" },
    ]);
    expect(result.current.nextCursor).toBeNull();

    // Verify API calls
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch).toHaveBeenCalledWith("/api/items?nextCursor=cursor2");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/items?nextCursor=cursor3");
  });

  it("works with tracks response key", async () => {
    const initialTracks = [{ id: "t1", name: "Track 1" }];
    const page2Tracks = [{ id: "t2", name: "Track 2" }];

    mockApiFetch.mockResolvedValueOnce({
      tracks: page2Tracks,
      nextCursor: null,
    });

    const { result } = renderHook(() =>
      useAutoLoadPaginated({
        initialItems: initialTracks,
        initialNextCursor: "cursor2",
        endpoint: "/api/playlists/123/tracks",
        itemsKey: "tracks",
      })
    );

    await waitFor(() => {
      expect(result.current.isAutoLoading).toBe(false);
    });

    expect(result.current.items).toEqual([
      { id: "t1", name: "Track 1" },
      { id: "t2", name: "Track 2" },
    ]);
  });

  it("handles API errors gracefully", async () => {
    const initialItems = [{ id: "1", name: "Item 1" }];
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockApiFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() =>
      useAutoLoadPaginated({
        initialItems,
        initialNextCursor: "cursor2",
        endpoint: "/api/items",
        itemsKey: "items",
      })
    );

    await waitFor(() => {
      expect(result.current.isAutoLoading).toBe(false);
    });

    // Should keep initial items on error
    expect(result.current.items).toEqual(initialItems);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[useAutoLoadPaginated] Auto-load failed"),
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  });

  it("can be disabled via enabled option", () => {
    const initialItems = [{ id: "1", name: "Item 1" }];

    const { result } = renderHook(() =>
      useAutoLoadPaginated({
        initialItems,
        initialNextCursor: "cursor2",
        endpoint: "/api/items",
        itemsKey: "items",
        enabled: false,
      })
    );

    expect(result.current.items).toEqual(initialItems);
    expect(result.current.isAutoLoading).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("exposes setItems and setNextCursor for manual control", async () => {
    const initialItems = [{ id: "1", name: "Item 1" }];

    mockApiFetch.mockResolvedValueOnce({
      items: [{ id: "2", name: "Item 2" }],
      nextCursor: null,
    });

    const { result } = renderHook(() =>
      useAutoLoadPaginated({
        initialItems,
        initialNextCursor: "cursor2",
        endpoint: "/api/items",
        itemsKey: "items",
      })
    );

    await waitFor(() => {
      expect(result.current.isAutoLoading).toBe(false);
    });

    // Manually update items (e.g., for refresh)
    const newItems = [{ id: "99", name: "New Item" }];
    act(() => {
      result.current.setItems(newItems);
    });

    expect(result.current.items).toEqual(newItems);

    // Manually update cursor
    act(() => {
      result.current.setNextCursor("newCursor");
    });
    expect(result.current.nextCursor).toBe("newCursor");
  });

  it("progressively updates items during loading", async () => {
    const initialItems = [{ id: "1", name: "Item 1" }];
    const page2Items = [{ id: "2", name: "Item 2" }];
    const page3Items = [{ id: "3", name: "Item 3" }];

    let resolveSecondPage: (value: any) => void;
    const secondPagePromise = new Promise((resolve) => {
      resolveSecondPage = resolve;
    });

    mockApiFetch
      .mockResolvedValueOnce({
        items: page2Items,
        nextCursor: "cursor3",
      })
      .mockImplementationOnce(() => secondPagePromise);

    const { result } = renderHook(() =>
      useAutoLoadPaginated({
        initialItems,
        initialNextCursor: "cursor2",
        endpoint: "/api/items",
        itemsKey: "items",
      })
    );

    // Wait for first page to load
    await waitFor(() => {
      expect(result.current.items.length).toBe(2);
    });

    expect(result.current.items).toEqual([
      { id: "1", name: "Item 1" },
      { id: "2", name: "Item 2" },
    ]);
    expect(result.current.isAutoLoading).toBe(true); // Still loading

    // Resolve second page
    resolveSecondPage!({
      items: page3Items,
      nextCursor: null,
    });

    await waitFor(() => {
      expect(result.current.isAutoLoading).toBe(false);
    });

    expect(result.current.items).toEqual([
      { id: "1", name: "Item 1" },
      { id: "2", name: "Item 2" },
      { id: "3", name: "Item 3" },
    ]);
  });

  it("handles empty pages gracefully", async () => {
    const initialItems = [{ id: "1", name: "Item 1" }];

    mockApiFetch.mockResolvedValueOnce({
      items: [], // Empty page
      nextCursor: null,
    });

    const { result } = renderHook(() =>
      useAutoLoadPaginated({
        initialItems,
        initialNextCursor: "cursor2",
        endpoint: "/api/items",
        itemsKey: "items",
      })
    );

    await waitFor(() => {
      expect(result.current.isAutoLoading).toBe(false);
    });

    expect(result.current.items).toEqual([{ id: "1", name: "Item 1" }]);
  });

  it("encodes cursor in URL", async () => {
    const initialItems = [{ id: "1" }];

    mockApiFetch.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });

    renderHook(() =>
      useAutoLoadPaginated({
        initialItems,
        initialNextCursor: "cursor with spaces & special=chars",
        endpoint: "/api/items",
        itemsKey: "items",
      })
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/items?nextCursor=cursor%20with%20spaces%20%26%20special%3Dchars"
    );
  });
});
