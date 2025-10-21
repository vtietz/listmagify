/**
 * Unit tests for sorting utilities
 */
import { describe, it, expect } from "vitest";
import type { Track } from "@/lib/spotify/types";
import {
  compareByPosition,
  compareByName,
  compareByArtist,
  compareByAlbum,
  compareByDuration,
  getComparator,
  sortTracks,
} from "@/lib/utils/sort";

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

describe("compareByPosition", () => {
  it("sorts by originalPosition ascending", () => {
    const a = createTrack({ originalPosition: 1 });
    const b = createTrack({ originalPosition: 2 });
    expect(compareByPosition(a, b)).toBeLessThan(0);
    expect(compareByPosition(b, a)).toBeGreaterThan(0);
  });

  it("falls back to position when originalPosition is missing", () => {
    const a = createTrack({ position: 1 });
    const b = createTrack({ position: 2 });
    expect(compareByPosition(a, b)).toBeLessThan(0);
  });

  it("returns 0 for equal positions", () => {
    const a = createTrack({ originalPosition: 5 });
    const b = createTrack({ originalPosition: 5 });
    expect(compareByPosition(a, b)).toBe(0);
  });
});

describe("compareByName", () => {
  it("sorts by name case-insensitively", () => {
    const a = createTrack({ name: "Apple", originalPosition: 0 });
    const b = createTrack({ name: "Banana", originalPosition: 1 });
    expect(compareByName(a, b)).toBeLessThan(0);
    expect(compareByName(b, a)).toBeGreaterThan(0);
  });

  it("handles case differences", () => {
    const a = createTrack({ name: "apple", originalPosition: 0 });
    const b = createTrack({ name: "BANANA", originalPosition: 1 });
    expect(compareByName(a, b)).toBeLessThan(0);
  });

  it("uses stable sort when names are equal", () => {
    const a = createTrack({ name: "Same", originalPosition: 1 });
    const b = createTrack({ name: "Same", originalPosition: 2 });
    expect(compareByName(a, b)).toBeLessThan(0);
  });
});

describe("compareByArtist", () => {
  it("sorts by first artist case-insensitively", () => {
    const a = createTrack({ artists: ["Adele"], originalPosition: 0 });
    const b = createTrack({ artists: ["Beatles"], originalPosition: 1 });
    expect(compareByArtist(a, b)).toBeLessThan(0);
  });

  it("handles empty artists array", () => {
    const a = createTrack({ artists: [], originalPosition: 0 });
    const b = createTrack({ artists: ["Artist"], originalPosition: 1 });
    expect(compareByArtist(a, b)).toBeLessThan(0);
  });

  it("uses stable sort when artists are equal", () => {
    const a = createTrack({ artists: ["Same Artist"], originalPosition: 1 });
    const b = createTrack({ artists: ["Same Artist"], originalPosition: 2 });
    expect(compareByArtist(a, b)).toBeLessThan(0);
  });
});

describe("compareByAlbum", () => {
  it("sorts by album name case-insensitively", () => {
    const a = createTrack({ album: { name: "Abbey Road" }, originalPosition: 0 });
    const b = createTrack({ album: { name: "Revolver" }, originalPosition: 1 });
    expect(compareByAlbum(a, b)).toBeLessThan(0);
  });

  it("handles null/undefined albums", () => {
    const a = createTrack({ album: null, originalPosition: 0 });
    const b = createTrack({ album: { name: "Album" }, originalPosition: 1 });
    expect(compareByAlbum(a, b)).toBeGreaterThan(0); // nulls sort to end
  });

  it("handles both null albums equally", () => {
    const a = createTrack({ album: null, originalPosition: 1 });
    const b = createTrack({ album: null, originalPosition: 2 });
    expect(compareByAlbum(a, b)).toBeLessThan(0); // stable sort
  });
});

describe("compareByDuration", () => {
  it("sorts by duration ascending", () => {
    const a = createTrack({ durationMs: 120000, originalPosition: 0 });
    const b = createTrack({ durationMs: 180000, originalPosition: 1 });
    expect(compareByDuration(a, b)).toBeLessThan(0);
  });

  it("uses stable sort when durations are equal", () => {
    const a = createTrack({ durationMs: 180000, originalPosition: 1 });
    const b = createTrack({ durationMs: 180000, originalPosition: 2 });
    expect(compareByDuration(a, b)).toBeLessThan(0);
  });
});

describe("getComparator", () => {
  it("returns correct comparator for each sort key", () => {
    expect(getComparator("position")).toBe(compareByPosition);
    expect(getComparator("name")).toBe(compareByName);
    expect(getComparator("artist")).toBe(compareByArtist);
    expect(getComparator("album")).toBe(compareByAlbum);
    expect(getComparator("duration")).toBe(compareByDuration);
  });
});

describe("sortTracks", () => {
  const tracks = [
    createTrack({ name: "Zebra", originalPosition: 0 }),
    createTrack({ name: "Apple", originalPosition: 1 }),
    createTrack({ name: "Mango", originalPosition: 2 }),
  ];

  it("sorts tracks by name ascending", () => {
    const sorted = sortTracks(tracks, "name", "asc");
    expect(sorted.map((t) => t.name)).toEqual(["Apple", "Mango", "Zebra"]);
  });

  it("sorts tracks by name descending", () => {
    const sorted = sortTracks(tracks, "name", "desc");
    expect(sorted.map((t) => t.name)).toEqual(["Zebra", "Mango", "Apple"]);
  });

  it("defaults to ascending when direction not specified", () => {
    const sorted = sortTracks(tracks, "name");
    expect(sorted.map((t) => t.name)).toEqual(["Apple", "Mango", "Zebra"]);
  });

  it("does not mutate original array", () => {
    const original = [...tracks];
    sortTracks(tracks, "name");
    expect(tracks).toEqual(original);
  });

  it("sorts by position (stable #)", () => {
    const sorted = sortTracks(tracks, "position");
    expect(sorted.map((t) => t.originalPosition)).toEqual([0, 1, 2]);
  });
});
