import { NextResponse } from "next/server";
import { RateLimitError } from "@/lib/spotify/rateLimit";

/**
 * Standard error response format for API routes.
 * Includes rate limit information when applicable.
 */
export interface ApiErrorResponse {
  error: string;
  code?: string;
  rateLimitInfo?: {
    retryAfterMs: number;
    retryAt: string;
  };
}

/**
 * Create a NextResponse for an error, with special handling for rate limits.
 * 
 * Usage:
 * ```ts
 * try {
 *   // ... API logic
 * } catch (error) {
 *   return handleApiError(error);
 * }
 * ```
 */
export function handleApiError(error: unknown): NextResponse {
  // Handle rate limit errors specially
  if (error instanceof RateLimitError) {
    console.warn(`[api] Rate limit error: ${error.message}`);
    return NextResponse.json(
      {
        error: error.message,
        code: "RATE_LIMIT_EXCEEDED",
        rateLimitInfo: {
          retryAfterMs: error.retryAfterMs,
          retryAt: error.retryAt.toISOString(),
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(error.retryAfterMs / 1000).toString(),
        },
      }
    );
  }

  // Handle other errors
  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  console.error("[api] Error:", error);
  
  return NextResponse.json(
    { error: message },
    { status: 500 }
  );
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}
