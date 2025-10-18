/**
 * Centralized API client with automatic 401 handling.
 * All client-side API calls should use this instead of raw fetch.
 */

// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
// The module exports toast correctly at runtime, but the .d.mts file structure causes TS errors
// This is a known issue: https://github.com/emilkowalski/sonner/issues/  
import { toast } from "sonner";

interface FetchOptions extends RequestInit {
  /** Skip automatic 401 redirect (for custom handling) */
  skipAutoRedirect?: boolean;
}

/**
 * Custom fetch wrapper that handles 401 errors globally.
 * Automatically redirects to login on token expiration.
 * 
 * Usage:
 * ```ts
 * const data = await apiFetch('/api/me/playlists');
 * const data = await apiFetch('/api/playlists/123/tracks', { method: 'POST' });
 * ```
 */
export async function apiFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { skipAutoRedirect = false, ...fetchOptions } = options;

  try {
    const response = await fetch(url, fetchOptions);
    const data = await response.json().catch(() => ({}));

    // Handle 401 Unauthorized - token expired
    if (!skipAutoRedirect && (response.status === 401 || data.error === "token_expired")) {
      toast.error("Your session has expired. Redirecting to login...");
      
      // Small delay for user to see the message
      setTimeout(() => {
        window.location.href = "/login?reason=expired";
      }, 1500);
      
      // Throw error to stop execution in calling code
      throw new ApiError("Session expired", 401, data);
    }

    // Handle other error statuses
    if (!response.ok) {
      throw new ApiError(
        data.error || `Request failed: ${response.status} ${response.statusText}`,
        response.status,
        data
      );
    }

    return data as T;
  } catch (error) {
    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error;
    }

    // Wrap network errors
    throw new ApiError(
      error instanceof Error ? error.message : "Network request failed",
      0,
      null
    );
  }
}

/**
 * Custom error class for API errors with status code and response data.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: any
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Check if this is a 401 error */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Check if this is a 403 error */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** Check if this is a 404 error */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Check if this is a network error (no status code) */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}
