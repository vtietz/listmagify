/**
 * Centralized API client with automatic error handling.
 * All client-side API calls should use this instead of raw fetch.
 */

import { toast } from "@/lib/ui/toast";

interface FetchOptions extends RequestInit {}

/**
 * Custom error for access token expiration.
 * Components should handle this by showing a sign-in prompt.
 * Navigation is handled by middleware, not client code.
 */
export class AccessTokenExpiredError extends Error {
  constructor(message = "Access token expired") {
    super(message);
    this.name = "AccessTokenExpiredError";
  }
}

/**
 * Custom fetch wrapper that handles API errors.
 * On 401 errors, shows a toast and redirects to login after a brief delay.
 * This ensures users are automatically sent to the login page when their session expires.
 * 
 * Usage:
 * ```ts
 * try {
 *   const data = await apiFetch('/api/me/playlists');
 * } catch (error) {
 *   if (error instanceof AccessTokenExpiredError) {
 *     // Toast shown, redirect scheduled
 *   }
 * }
 * ```
 */
export async function apiFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    // Handle 401 Unauthorized - token expired
    if (response.status === 401 || data.error === "token_expired") {
      // Don't redirect if already on login page (prevents infinite loop)
      const isLoginPage = window.location.pathname === '/login';
      
      if (!isLoginPage) {
        toast.error("Your session has expired. Redirecting to login...");
        
        // Redirect to login after a brief delay to show the toast
        // Only use pathname as next (not query params to avoid nested encoding)
        setTimeout(() => {
          const nextPath = window.location.pathname;
          window.location.href = `/login?reason=expired&next=${encodeURIComponent(nextPath)}`;
        }, 1500);
      }
      
      throw new AccessTokenExpiredError(data.error || "Session expired");
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
    // Re-throw AccessTokenExpiredError and ApiError as-is
    if (error instanceof AccessTokenExpiredError || error instanceof ApiError) {
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
