/**
 * Tests for the centralized error handling system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createAppError,
  createRateLimitError,
  sanitizeStack,
} from "@/lib/errors/types";

describe("Error Types", () => {
  describe("createAppError", () => {
    it("should create an error with defaults", () => {
      const error = createAppError({
        message: "Test error",
        category: "api",
      });

      expect(error.message).toBe("Test error");
      expect(error.category).toBe("api");
      expect(error.severity).toBe("error");
      expect(error.userNotified).toBe(false);
      expect(error.reported).toBe(false);
      expect(error.id).toBeDefined();
      expect(error.timestamp).toBeDefined();
    });

    it("should allow overriding defaults", () => {
      const error = createAppError({
        message: "Warning message",
        category: "validation",
        severity: "warning",
        userNotified: true,
      });

      expect(error.severity).toBe("warning");
      expect(error.userNotified).toBe(true);
    });

    it("should include optional fields", () => {
      const error = createAppError({
        message: "Test error",
        category: "network",
        details: "Connection failed",
        statusCode: 503,
        requestPath: "/api/test",
        context: { retryCount: 3 },
      });

      expect(error.details).toBe("Connection failed");
      expect(error.statusCode).toBe(503);
      expect(error.requestPath).toBe("/api/test");
      expect(error.context).toEqual({ retryCount: 3 });
    });
  });

  describe("createRateLimitError", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-07T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should create a rate limit error with retry info", () => {
      const retryAfterMs = 3600000; // 1 hour
      const error = createRateLimitError(retryAfterMs, "/me/playlists");

      expect(error.category).toBe("rate_limit");
      expect(error.severity).toBe("warning");
      expect(error.statusCode).toBe(429);
      expect(error.requestPath).toBe("/me/playlists");
      expect(error.retryAfter).toBeDefined();
      expect(error.retryAfter!.seconds).toBe(3600);
    });

    it("should format hours correctly in message", () => {
      const error = createRateLimitError(2 * 3600 * 1000); // 2 hours
      expect(error.message).toContain("2 hours");
    });

    it("should format minutes correctly in message", () => {
      const error = createRateLimitError(30 * 60 * 1000); // 30 minutes
      expect(error.message).toContain("30 minutes");
    });

    it("should format seconds correctly for short waits", () => {
      const error = createRateLimitError(45 * 1000); // 45 seconds
      expect(error.message).toContain("45 seconds");
    });

    it("should format combined hours and minutes", () => {
      const error = createRateLimitError((2 * 3600 + 30 * 60) * 1000); // 2h 30m
      expect(error.message).toContain("2 hours");
      expect(error.message).toContain("30 min");
    });
  });

  describe("sanitizeStack", () => {
    it("should return undefined for undefined input", () => {
      expect(sanitizeStack(undefined)).toBeUndefined();
    });

    it("should limit stack to 10 frames", () => {
      const longStack = Array(20)
        .fill("    at someFunction (/path/to/file.ts:10:5)")
        .join("\n");
      const sanitized = sanitizeStack(longStack);
      const lines = sanitized!.split("\n");
      expect(lines.length).toBe(10);
    });

    it("should remove absolute paths", () => {
      const stack = "    at someFunction (/home/user/project/src/file.ts:10:5)";
      const sanitized = sanitizeStack(stack);
      expect(sanitized).not.toContain("/home/user/project/src/");
      // The regex keeps just the filename
      expect(sanitized).toContain("file.ts");
    });
  });
});

describe("RateLimitError class", () => {
  it("should be importable from spotify/rateLimit", async () => {
    const { RateLimitError } = await import("@/lib/spotify/rateLimit");
    const error = new RateLimitError(60000, "/api/test");

    expect(error.name).toBe("RateLimitError");
    expect(error.retryAfterMs).toBe(60000);
    expect(error.requestPath).toBe("/api/test");
    expect(error.statusCode).toBe(429);
  }, 15000);
});
