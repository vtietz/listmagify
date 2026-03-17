/**
 * Centralized API client with automatic error handling.
 * All client-side API calls should use this instead of raw fetch.
 */

import { toast } from "@/lib/ui/toast";
import { reportError, useErrorStore } from "@/lib/errors/store";
import { createRateLimitError, createAppError } from "@/lib/errors/types";

interface FetchOptions extends RequestInit {}

const PROVIDER_STORAGE_KEY = 'music-provider-id';
const PROVIDER_MISMATCH_RELOAD_KEY = 'provider-mismatch-reload-attempted';

function isMusicProviderId(value: string | null | undefined): value is 'spotify' | 'tidal' {
  return value === 'spotify' || value === 'tidal';
}

function getCurrentProviderId(): 'spotify' | 'tidal' {
  if (typeof window === 'undefined') {
    return 'spotify';
  }

  const fromQuery = new URLSearchParams(window.location.search).get('provider');
  if (isMusicProviderId(fromQuery)) {
    window.localStorage.setItem(PROVIDER_STORAGE_KEY, fromQuery);
    return fromQuery;
  }

  const fromStorage = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
  if (isMusicProviderId(fromStorage)) {
    return fromStorage;
  }

  return 'spotify';
}

function withProviderOnApiUrl(url: string, providerId: 'spotify' | 'tidal'): string {
  if (!url.startsWith('/api/')) {
    return url;
  }

  const [rawPath, query] = url.split('?');
  const path = rawPath ?? url;
  const params = new URLSearchParams(query ?? '');
  if (!params.has('provider')) {
    params.set('provider', providerId);
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `${path}?${serialized}` : path;
}

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

// Deduplication state for session expiry handling
// Prevents multiple toasts and redirects when many API calls fail simultaneously
let sessionExpiredHandled = false;
let sessionExpiredTimeout: ReturnType<typeof setTimeout> | null = null;

function shouldForceReloadForMissingProvider(status: number, data: unknown): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (status !== 400) {
    return false;
  }

  if (!data || typeof data !== 'object') {
    return false;
  }

  const errorValue = (data as { error?: unknown }).error;
  if (typeof errorValue !== 'string') {
    return false;
  }

  return errorValue.includes('Missing provider');
}

function maybeRecoverFromProviderMismatch(status: number, data: unknown): boolean {
  if (!shouldForceReloadForMissingProvider(status, data)) {
    return false;
  }

  const hasAttemptedReload = window.sessionStorage.getItem(PROVIDER_MISMATCH_RELOAD_KEY) === '1';
  if (hasAttemptedReload) {
    toast.error('App updated. Please do a full browser reload.', {
      id: 'provider-mismatch-refresh',
      duration: 5000,
    });
    return false;
  }

  window.sessionStorage.setItem(PROVIDER_MISMATCH_RELOAD_KEY, '1');
  window.location.reload();
  return true;
}

/**
 * Reset the session expiry handling state.
 * Called internally after redirect, exposed for testing.
 */
export function resetSessionExpiredState() {
  sessionExpiredHandled = false;
  if (sessionExpiredTimeout) {
    clearTimeout(sessionExpiredTimeout);
    sessionExpiredTimeout = null;
  }

  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(PROVIDER_MISMATCH_RELOAD_KEY);
  }
}

/**
 * Custom fetch wrapper that handles API errors.
 * On 401 errors, shows a single toast and redirects to login after a brief delay.
 * Multiple simultaneous 401 errors are deduplicated to prevent toast spam.
 * 
 * Usage:
 * ```ts
 * try {
 *   const data = await apiFetch('/api/me/playlists');
 * } catch (error) {
 *   if (error instanceof AccessTokenExpiredError) {
 *     // Toast shown (once), redirect scheduled
 *   }
 * }
 * ```
 */
export async function apiFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  try {
    const providerId = getCurrentProviderId();
    const resolvedUrl = withProviderOnApiUrl(url, providerId);
    const headers = new Headers(options.headers ?? {});
    if (resolvedUrl.startsWith('/api/') && !headers.has('x-music-provider')) {
      headers.set('x-music-provider', providerId);
    }

    const response = await fetch(resolvedUrl, {
      ...options,
      headers,
    });
    const data = await response.json().catch(() => ({}));

    // Handle 401 Unauthorized - token expired
    if (response.status === 401 || data.error === "token_expired") {
      // Don't redirect if already on login page (prevents infinite loop)
      const isLoginPage = window.location.pathname === '/login';
      
      // Deduplicate: only show toast and redirect once per session expiry
      if (!isLoginPage && !sessionExpiredHandled) {
        sessionExpiredHandled = true;
        
        // Show a single toast with a unique ID to prevent duplicates
        toast.error("Your session has expired. Redirecting to login...", {
          id: 'session-expired',
          duration: 3000,
        });
        
        // Redirect to login after a brief delay to show the toast
        // Only use pathname as next (not query params to avoid nested encoding)
        sessionExpiredTimeout = setTimeout(() => {
          const nextPath = window.location.pathname;
          window.location.href = `/login?reason=expired&next=${encodeURIComponent(nextPath)}`;
        }, 1500);
      }
      
      throw new AccessTokenExpiredError(data.error || "Session expired");
    }

    const requestPath = url.split("?")[0];
    const shouldOpenErrorDialog = process.env.NEXT_PUBLIC_E2E_MODE !== '1';

    // Handle 429 Rate Limit - report to error store
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const retryAfterMs = retryAfter 
        ? parseInt(retryAfter, 10) * 1000 
        : 60 * 60 * 1000; // Default to 1 hour
      
      // Remove query params for reporting
      const rateLimitError = createRateLimitError(retryAfterMs, requestPath);
      
      // Report to error store and show dialog
      reportError(rateLimitError);
      if (shouldOpenErrorDialog) {
        useErrorStore.getState().openDialog(rateLimitError);
      }
      
      throw new RateLimitApiError(
        rateLimitError.message,
        retryAfterMs,
        data
      );
    }

    // Handle other error statuses
    if (!response.ok) {
      if (maybeRecoverFromProviderMismatch(response.status, data)) {
        throw new ApiError('App updated, reloading to recover request context', response.status, data);
      }

      const errorMessage = data.error || data.details || `Request failed: ${response.status} ${response.statusText}`;
      const apiError = new ApiError(errorMessage, response.status, data);

      // Suppress dialog for known non-critical errors
      const suppressDialog =
        requestPath === '/api/player/control' && data?.error === 'no_active_device';
      
      // Handle user not approved error with helpful message
      if (data?.error === 'user_not_approved') {
        const appError = createAppError({
          message: 'Your account is not approved yet',
          details: 'Please request access from the homepage. The administrator needs to add you to the Spotify Developer Dashboard.',
          category: 'auth',
          severity: 'warning',
          statusCode: response.status,
          ...(requestPath ? { requestPath } : {}),
        });
        
        reportError(appError);
        if (shouldOpenErrorDialog) {
          useErrorStore.getState().openDialog(appError);
        }
        throw apiError;
      }
      
      // Report API errors to error store and show dialog (except auth errors handled above)
      if (!suppressDialog) {
        const appError = createAppError({
          message: errorMessage,
          details: data.details || (data.error && typeof data.error === 'object' ? JSON.stringify(data.error) : undefined),
          category: 'api',
          severity: response.status >= 500 ? 'error' : 'warning',
          statusCode: response.status,
          ...(requestPath ? { requestPath } : {}),
        });
        
        reportError(appError);
        if (shouldOpenErrorDialog) {
          useErrorStore.getState().openDialog(appError);
        }
      }
      
      throw apiError;
    }

    return data as T;
  } catch (error) {
    // Re-throw known error types as-is
    if (
      error instanceof AccessTokenExpiredError || 
      error instanceof ApiError ||
      error instanceof RateLimitApiError
    ) {
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

  /** Check if this is a rate limit error (429) */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** Check if this is a network error (no status code) */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/**
 * Custom error class for rate limit errors (429).
 * Contains retry information.
 */
export class RateLimitApiError extends ApiError {
  constructor(
    message: string,
    public retryAfterMs: number,
    data: any
  ) {
    super(message, 429, data);
    this.name = "RateLimitApiError";
  }

  /** Get the timestamp when retry is allowed */
  get retryAt(): Date {
    return new Date(Date.now() + this.retryAfterMs);
  }
}
