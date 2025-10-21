/**
 * Unit tests for formatting utilities
 */
import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatCumulativeDuration,
} from "@/lib/utils/format";

describe("formatDuration", () => {
  it("formats seconds correctly (MM:SS)", () => {
    expect(formatDuration(45000)).toBe("0:45"); // 45 seconds
    expect(formatDuration(125000)).toBe("2:05"); // 2 minutes 5 seconds
  });

  it("formats minutes correctly", () => {
    expect(formatDuration(180000)).toBe("3:00"); // 3 minutes
    expect(formatDuration(245000)).toBe("4:05"); // 4 minutes 5 seconds
  });

  it("formats hours correctly (HH:MM:SS)", () => {
    expect(formatDuration(3600000)).toBe("1:00:00"); // 1 hour
    expect(formatDuration(3665000)).toBe("1:01:05"); // 1 hour 1 minute 5 seconds
    expect(formatDuration(7325000)).toBe("2:02:05"); // 2 hours 2 minutes 5 seconds
  });

  it("handles zero duration", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("rounds down fractional seconds", () => {
    expect(formatDuration(45999)).toBe("0:45"); // 45.999 seconds
  });
});

describe("formatCumulativeDuration", () => {
  const tracks = [
    { durationMs: 180000 }, // 3:00
    { durationMs: 240000 }, // 4:00
    { durationMs: 210000 }, // 3:30
  ];

  it("calculates cumulative duration for first track", () => {
    expect(formatCumulativeDuration(tracks, 0)).toBe("3:00");
  });

  it("calculates cumulative duration for multiple tracks", () => {
    expect(formatCumulativeDuration(tracks, 1)).toBe("7:00"); // 3:00 + 4:00
    expect(formatCumulativeDuration(tracks, 2)).toBe("10:30"); // 3:00 + 4:00 + 3:30
  });

  it("handles empty array", () => {
    expect(formatCumulativeDuration([], 0)).toBe("0:00");
  });

  it("handles single track", () => {
    expect(formatCumulativeDuration([{ durationMs: 125000 }], 0)).toBe("2:05");
  });

  it("formats cumulative duration over 1 hour", () => {
    const longTracks = [
      { durationMs: 2400000 }, // 40:00
      { durationMs: 1800000 }, // 30:00
      { durationMs: 600000 },  // 10:00
    ];
    expect(formatCumulativeDuration(longTracks, 2)).toBe("1:20:00");
  });
});
