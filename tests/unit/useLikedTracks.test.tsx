import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as apiClient from "@/lib/api/client";
import { useLikedTracksStatus, useToggleSavedTrack, likedTracksKey } from "@/hooks/useLikedTracks";
import type { Track } from "@/lib/spotify/types";
import { ReactNode } from "react";

// Mock the API client
vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
}));

// Create test tracks
function createTrack(id: string | null, name: string): Track {
  return {
    id,
    uri: id ? `spotify:track:${id}` : `spotify:local:${name}`,
    name,
    artists: ["Test Artist"],
    durationMs: 180000,
  };
}

describe("useLikedTracksStatus", () => {
  const mockApiFetch = vi.mocked(apiClient.apiFetch);
  let queryClient: QueryClient;

  // Wrapper component for React Query
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("returns empty map when tracks array is empty", () => {
    const { result } = renderHook(
      () =>
        useLikedTracksStatus({
          playlistId: "playlist1",
          snapshotId: "snapshot1",
          tracks: [],
          enabled: true,
        }),
      { wrapper }
    );

    expect(result.current.likedMap.size).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("returns empty map when disabled", () => {
    const tracks = [createTrack("track1", "Test Track")];

    const { result } = renderHook(
      () =>
        useLikedTracksStatus({
          playlistId: "playlist1",
          snapshotId: "snapshot1",
          tracks,
          enabled: false,
        }),
      { wrapper }
    );

    expect(result.current.likedMap.size).toBe(0);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("fetches liked status for tracks", async () => {
    const tracks = [
      createTrack("track1", "Track 1"),
      createTrack("track2", "Track 2"),
      createTrack("track3", "Track 3"),
    ];

    mockApiFetch.mockResolvedValueOnce([true, false, true]);

    const { result } = renderHook(
      () =>
        useLikedTracksStatus({
          playlistId: "playlist1",
          snapshotId: "snapshot1",
          tracks,
          enabled: true,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/tracks/contains?ids=track1,track2,track3");
    expect(result.current.likedMap.get("track1")).toBe(true);
    expect(result.current.likedMap.get("track2")).toBe(false);
    expect(result.current.likedMap.get("track3")).toBe(true);
  });

  it("filters out local files (null IDs)", async () => {
    const tracks = [
      createTrack("track1", "Track 1"),
      createTrack(null, "Local File"),
      createTrack("track2", "Track 2"),
    ];

    mockApiFetch.mockResolvedValueOnce([true, false]);

    const { result } = renderHook(
      () =>
        useLikedTracksStatus({
          playlistId: "playlist1",
          snapshotId: "snapshot1",
          tracks,
          enabled: true,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should only request non-null IDs
    expect(mockApiFetch).toHaveBeenCalledWith("/api/tracks/contains?ids=track1,track2");
    expect(result.current.likedMap.has(null as unknown as string)).toBe(false);
  });

  it("batches requests for more than 50 tracks", async () => {
    // Create 75 tracks
    const tracks = Array.from({ length: 75 }, (_, i) =>
      createTrack(`track${i + 1}`, `Track ${i + 1}`)
    );

    // First batch of 50
    const firstBatchResults = Array.from({ length: 50 }, (_, i) => i % 2 === 0);
    // Second batch of 25
    const secondBatchResults = Array.from({ length: 25 }, (_, i) => i % 2 === 1);

    mockApiFetch
      .mockResolvedValueOnce(firstBatchResults)
      .mockResolvedValueOnce(secondBatchResults);

    const { result } = renderHook(
      () =>
        useLikedTracksStatus({
          playlistId: "playlist1",
          snapshotId: "snapshot1",
          tracks,
          enabled: true,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have made 2 API calls
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    
    // First call should have 50 IDs
    const firstCallIds = (mockApiFetch.mock.calls[0]![0] as string).split("ids=")[1]!.split(",");
    expect(firstCallIds.length).toBe(50);
    
    // Second call should have 25 IDs
    const secondCallIds = (mockApiFetch.mock.calls[1]![0] as string).split("ids=")[1]!.split(",");
    expect(secondCallIds.length).toBe(25);

    // Verify map contains all tracks
    expect(result.current.likedMap.size).toBe(75);
  });

  it("does not fetch when playlistId is undefined", () => {
    const tracks = [createTrack("track1", "Track 1")];

    const { result } = renderHook(
      () =>
        useLikedTracksStatus({
          playlistId: undefined,
          snapshotId: "snapshot1",
          tracks,
          enabled: true,
        }),
      { wrapper }
    );

    expect(result.current.likedMap.size).toBe(0);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("does not fetch when snapshotId is undefined", () => {
    const tracks = [createTrack("track1", "Track 1")];

    const { result } = renderHook(
      () =>
        useLikedTracksStatus({
          playlistId: "playlist1",
          snapshotId: undefined,
          tracks,
          enabled: true,
        }),
      { wrapper }
    );

    expect(result.current.likedMap.size).toBe(0);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("useToggleSavedTrack", () => {
  const mockApiFetch = vi.mocked(apiClient.apiFetch);
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("saves track when currentlyLiked is false", async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true });

    // Pre-populate cache with liked map
    const initialMap = new Map([["track1", false]]);
    queryClient.setQueryData(likedTracksKey("playlist1", "snapshot1"), initialMap);

    const { result } = renderHook(
      () =>
        useToggleSavedTrack({
          playlistId: "playlist1",
          snapshotId: "snapshot1",
        }),
      { wrapper }
    );

    await act(async () => {
      result.current.mutate({ trackId: "track1", currentlyLiked: false });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/tracks/save", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["track1"] }),
    });

    // Check optimistic update was applied
    const updatedMap = queryClient.getQueryData(
      likedTracksKey("playlist1", "snapshot1")
    ) as Map<string, boolean> | undefined;
    expect(updatedMap?.get("track1")).toBe(true);
  });

  it("removes track when currentlyLiked is true", async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true });

    // Pre-populate cache with liked map
    const initialMap = new Map([["track1", true]]);
    queryClient.setQueryData(likedTracksKey("playlist1", "snapshot1"), initialMap);

    const { result } = renderHook(
      () =>
        useToggleSavedTrack({
          playlistId: "playlist1",
          snapshotId: "snapshot1",
        }),
      { wrapper }
    );

    await act(async () => {
      result.current.mutate({ trackId: "track1", currentlyLiked: true });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/tracks/remove", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["track1"] }),
    });

    // Check optimistic update was applied
    const updatedMap = queryClient.getQueryData(
      likedTracksKey("playlist1", "snapshot1")
    ) as Map<string, boolean> | undefined;
    expect(updatedMap?.get("track1")).toBe(false);
  });

  it("rolls back on error", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("API Error"));

    // Pre-populate cache with liked map
    const initialMap = new Map([["track1", false]]);
    queryClient.setQueryData(likedTracksKey("playlist1", "snapshot1"), initialMap);

    const { result } = renderHook(
      () =>
        useToggleSavedTrack({
          playlistId: "playlist1",
          snapshotId: "snapshot1",
        }),
      { wrapper }
    );

    await act(async () => {
      result.current.mutate({ trackId: "track1", currentlyLiked: false });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Check that cache was rolled back
    const rolledBackMap = queryClient.getQueryData(
      likedTracksKey("playlist1", "snapshot1")
    ) as Map<string, boolean> | undefined;
    expect(rolledBackMap?.get("track1")).toBe(false);
  });

  it("optimistically updates before API call completes", async () => {
    // Create a delayed promise
    let resolveApiCall: (value: { success: boolean }) => void;
    const delayedPromise = new Promise<{ success: boolean }>((resolve) => {
      resolveApiCall = resolve;
    });
    mockApiFetch.mockReturnValueOnce(delayedPromise);

    // Pre-populate cache
    const initialMap = new Map([["track1", false]]);
    queryClient.setQueryData(likedTracksKey("playlist1", "snapshot1"), initialMap);

    const { result } = renderHook(
      () =>
        useToggleSavedTrack({
          playlistId: "playlist1",
          snapshotId: "snapshot1",
        }),
      { wrapper }
    );

    // Trigger mutation
    await act(async () => {
      result.current.mutate({ trackId: "track1", currentlyLiked: false });
    });

    // Before API resolves, cache should be optimistically updated
    const optimisticMap = queryClient.getQueryData(
      likedTracksKey("playlist1", "snapshot1")
    ) as Map<string, boolean> | undefined;
    expect(optimisticMap?.get("track1")).toBe(true);

    // Now resolve the API call
    await act(async () => {
      resolveApiCall!({ success: true });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

describe("likedTracksKey", () => {
  it("generates consistent query keys", () => {
    const key1 = likedTracksKey("playlist1", "snapshot1");
    const key2 = likedTracksKey("playlist1", "snapshot1");
    const key3 = likedTracksKey("playlist1", "snapshot2");

    expect(key1).toEqual(key2);
    expect(key1).not.toEqual(key3);
    expect(key1).toEqual(["liked-tracks", "playlist1", "snapshot1"]);
  });
});
