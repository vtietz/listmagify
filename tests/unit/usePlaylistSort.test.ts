/**
 * Unit tests for usePlaylistSort hook
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePlaylistSort, type SortKey, type SortDirection } from "@/hooks/usePlaylistSort";
import type { Track } from "@/lib/spotify/types";

interface TestProps {
  tracks: Track[];
  sortKey: SortKey;
  sortDirection?: SortDirection;
}

// Test fixture factory
function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "test-id",
    uri: "spotify:track:test",
    name: "Test Track",
    artists: ["Test Artist"],
    durationMs: 180000,
    ...overrides,
  };
}

describe("usePlaylistSort", () => {
  const tracks = [
    createTrack({ name: "Zebra", originalPosition: 0 }),
    createTrack({ name: "Apple", originalPosition: 1 }),
    createTrack({ name: "Mango", originalPosition: 2 }),
  ];

  it("sorts tracks by name ascending", () => {
    const { result } = renderHook(() =>
      usePlaylistSort({
        tracks,
        sortKey: "name",
        sortDirection: "asc",
      })
    );

    expect(result.current.map((t) => t.name)).toEqual([
      "Apple",
      "Mango",
      "Zebra",
    ]);
  });

  it("sorts tracks by name descending", () => {
    const { result } = renderHook(() =>
      usePlaylistSort({
        tracks,
        sortKey: "name",
        sortDirection: "desc",
      })
    );

    expect(result.current.map((t) => t.name)).toEqual([
      "Zebra",
      "Mango",
      "Apple",
    ]);
  });

  it("defaults to ascending when direction not specified", () => {
    const { result } = renderHook(() =>
      usePlaylistSort({
        tracks,
        sortKey: "name",
      })
    );

    expect(result.current.map((t) => t.name)).toEqual([
      "Apple",
      "Mango",
      "Zebra",
    ]);
  });

  it("sorts by position (original order)", () => {
    const { result } = renderHook(() =>
      usePlaylistSort({
        tracks,
        sortKey: "position",
      })
    );

    expect(result.current.map((t) => t.originalPosition)).toEqual([0, 1, 2]);
  });

  it("sorts by duration", () => {
    const durationTracks = [
      createTrack({ durationMs: 300000, originalPosition: 0 }),
      createTrack({ durationMs: 120000, originalPosition: 1 }),
      createTrack({ durationMs: 240000, originalPosition: 2 }),
    ];

    const { result } = renderHook(() =>
      usePlaylistSort({
        tracks: durationTracks,
        sortKey: "duration",
      })
    );

    expect(result.current.map((t) => t.durationMs)).toEqual([
      120000, 240000, 300000,
    ]);
  });

  it("memoizes result when inputs don't change", () => {
    const { result, rerender } = renderHook(
      (props) =>
        usePlaylistSort({
          tracks: props.tracks,
          sortKey: props.sortKey,
          sortDirection: props.sortDirection,
        }),
      {
        initialProps: {
          tracks,
          sortKey: "name" as const,
          sortDirection: "asc" as const,
        },
      }
    );

    const firstResult = result.current;

    // Re-render with same props
    rerender({
      tracks,
      sortKey: "name",
      sortDirection: "asc",
    });

    // Should return the same memoized result (referential equality)
    expect(result.current).toBe(firstResult);
  });

  it("re-sorts when sortKey changes", () => {
    const { result, rerender } = renderHook<Track[], TestProps>(
      (props) =>
        usePlaylistSort({
          tracks: props.tracks,
          sortKey: props.sortKey,
        }),
      {
        initialProps: {
          tracks,
          sortKey: "name",
        },
      }
    );

    const firstResult = result.current;
    expect(firstResult.map((t) => t.name)).toEqual(["Apple", "Mango", "Zebra"]);

    // Re-render with different sortKey
    rerender({
      tracks,
      sortKey: "position",
    });

    // Should return different result
    expect(result.current).not.toBe(firstResult);
    expect(result.current.map((t) => t.originalPosition)).toEqual([0, 1, 2]);
  });

  it("re-sorts when sortDirection changes", () => {
    const { result, rerender } = renderHook<Track[], TestProps>(
      (props) =>
        usePlaylistSort({
          tracks: props.tracks,
          sortKey: props.sortKey,
          sortDirection: props.sortDirection ?? "asc",
        }),
      {
        initialProps: {
          tracks,
          sortKey: "name",
          sortDirection: "asc",
        },
      }
    );

    expect(result.current.map((t) => t.name)).toEqual(["Apple", "Mango", "Zebra"]);

    // Re-render with different direction
    rerender({
      tracks,
      sortKey: "name",
      sortDirection: "desc",
    });

    expect(result.current.map((t) => t.name)).toEqual(["Zebra", "Mango", "Apple"]);
  });
});
