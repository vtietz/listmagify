/**
 * Centralized API client with automatic error handling.
 * All client-side API calls should use this instead of raw fetch.
 */

import { toast } from "@/lib/ui/toast";
import { reportError, useErrorStore } from "@/lib/errors/store";
import { createRateLimitError, createAppError } from "@/lib/errors/types";
import type { AppError } from "@/lib/errors/types";
import { isPerPanelInlineLoginEnabled } from '@/lib/utils';
import { providerAuthRegistry } from '@/lib/providers/authRegistry';
import {
  ProviderAuthError,
  isAuthError,
  isProviderAuthErrorPayload,
} from '@/lib/providers/errors';
import type { ProviderAuthCode } from '@/lib/providers/types';

interface FetchOptions extends RequestInit {
  /**
   * When true, suppresses the generic error dialog for non-OK responses.
   * Use this in mutations that handle their own error UI (e.g. toast in onError).
   */
  suppressErrorDialog?: boolean;
}

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

function getProviderAuthCodeFromStatus(status: number, errorValue: string | undefined): ProviderAuthCode | null {
  const normalizedError = (errorValue ?? '').toLowerCase();

  if (status === 401) {
    if (normalizedError.includes('token_expired') || normalizedError.includes('refresh')) {
      return 'expired';
    }

    return 'unauthenticated';
  }

  if (status === 403) {
    return 'insufficient_scope';
  }

  if (status === 429) {
    return 'rate_limited';
  }

  if (status >= 500 && status <= 599) {
    return 'provider_unavailable';
  }

  return null;
}

function parseRetryAfterMs(response: Response, data: any): number | undefined {
  if (typeof data?.retryAfterMs === 'number') {
    return data.retryAfterMs;
  }

  if (typeof data?.retryAfter === 'number') {
    return data.retryAfter * 1000;
  }

  const retryAfterHeader = response.headers.get('Retry-After');
  if (!retryAfterHeader) {
    return undefined;
  }

  const parsedSeconds = Number.parseInt(retryAfterHeader, 10);
  return Number.isNaN(parsedSeconds) ? undefined : parsedSeconds * 1000;
}

function mapResponseToProviderAuthError(
  response: Response,
  data: any,
  providerId: 'spotify' | 'tidal',
): ProviderAuthError | null {
  if (isProviderAuthErrorPayload(data)) {
    return new ProviderAuthError(
      data.provider,
      data.code,
      data.message,
      data.retryAfterMs,
    );
  }

  const errorValue = typeof data?.error === 'string' ? data.error : undefined;
  if (response.status === 403 && errorValue === 'premium_required') {
    return null;
  }

  const code = getProviderAuthCodeFromStatus(response.status, errorValue);
  if (!code) {
    return null;
  }

  const message = typeof data?.message === 'string'
    ? data.message
    : (errorValue ?? `Request failed: ${response.status} ${response.statusText}`);

  return new ProviderAuthError(
    providerId,
    code,
    message,
    parseRetryAfterMs(response, data),
  );
}

function publishProviderAuthError(error: ProviderAuthError): void {
  providerAuthRegistry.setFromAuthError(error);
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
function isKnownApiError(error: unknown): error is AccessTokenExpiredError | ApiError | RateLimitApiError | ProviderAuthError {
  return (
    error instanceof AccessTokenExpiredError ||
    error instanceof ApiError ||
    error instanceof RateLimitApiError ||
    isAuthError(error)
  );
}

function toNetworkApiError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : "Network request failed";
  return new ApiError(message, 0, null);
}

async function parseJsonSafely(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function reportAndOpenDialog(appError: AppError, shouldOpenErrorDialog: boolean): void {
  reportError(appError);
  if (shouldOpenErrorDialog) {
    useErrorStore.getState().openDialog(appError);
  }
}

function resolveErrorDetails(data: any): string | undefined {
  return data.details || (data.error && typeof data.error === 'object' ? JSON.stringify(data.error) : undefined);
}

function buildUserNotApprovedAppError(response: Response, requestPath: string): AppError {
  return createAppError({
    message: 'Your account is not approved yet',
    details: 'Please request access from the homepage. The administrator needs to add you to the Spotify Developer Dashboard.',
    category: 'auth',
    severity: 'warning',
    statusCode: response.status,
    ...(requestPath ? { requestPath } : {}),
  });
}

function buildGenericAppError(response: Response, data: any, errorMessage: string, requestPath: string): AppError {
  const details = resolveErrorDetails(data);
  return createAppError({
    message: errorMessage,
    ...(details !== undefined && { details }),
    category: 'api',
    severity: response.status >= 500 ? 'error' : 'warning',
    statusCode: response.status,
    ...(requestPath ? { requestPath } : {}),
  });
}


function handleUnauthorizedResponse(data: any): never {
  const isLoginPage = window.location.pathname === '/login';
  if (!isLoginPage && !sessionExpiredHandled) {
    sessionExpiredHandled = true;
    toast.error("Your session has expired. Redirecting to login...", {
      id: 'session-expired',
      duration: 3000,
    });
    sessionExpiredTimeout = setTimeout(() => {
      const nextPath = window.location.pathname;
      window.location.href = `/login?reason=expired&next=${encodeURIComponent(nextPath)}`;
    }, 1500);
  }
  throw new AccessTokenExpiredError(data.error || "Session expired");
}

function handleRateLimitResponse(response: Response, data: any, requestPath: string, shouldOpenErrorDialog: boolean): never {
  const retryAfter = response.headers.get("Retry-After");
  const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60 * 60 * 1000;
  const rateLimitError = createRateLimitError(retryAfterMs, requestPath);
  reportError(rateLimitError);
  if (shouldOpenErrorDialog) {
    useErrorStore.getState().openDialog(rateLimitError);
  }
  throw new RateLimitApiError(rateLimitError.message, retryAfterMs, data);
}

function handleErrorResponse(response: Response, data: any, requestPath: string, shouldOpenErrorDialog: boolean): never {
  if (maybeRecoverFromProviderMismatch(response.status, data)) {
    throw new ApiError('App updated, reloading to recover request context', response.status, data);
  }

  const errorMessage = data.error || data.details || `Request failed: ${response.status} ${response.statusText}`;
  const apiError = new ApiError(errorMessage, response.status, data);
  const isProviderMismatch = response.status === 400 && typeof errorMessage === 'string'
    && (errorMessage.includes('not compatible with provider') || errorMessage.includes('Missing provider'));
  const suppressDialog = isProviderMismatch
    || (requestPath === '/api/player/control' && data.error === 'no_active_device');

  if (data.error === 'user_not_approved') {
    reportAndOpenDialog(buildUserNotApprovedAppError(response, requestPath), shouldOpenErrorDialog);
    throw apiError;
  }

  if (!suppressDialog) {
    reportAndOpenDialog(buildGenericAppError(response, data, errorMessage, requestPath), shouldOpenErrorDialog);
  }

  throw apiError;
}

type ApiResponseHandlingOptions = {
  perPanelInlineLoginEnabled: boolean;
  resolvedUrl: string;
  providerId: 'spotify' | 'tidal';
  requestPath: string;
  shouldOpenErrorDialog: boolean;
};

function maybeHandleProviderAuthError(
  response: Response,
  data: any,
  options: ApiResponseHandlingOptions,
): void {
  const { perPanelInlineLoginEnabled, resolvedUrl, providerId } = options;
  if (!perPanelInlineLoginEnabled || !resolvedUrl.startsWith('/api/')) {
    return;
  }

  const providerAuthError = mapResponseToProviderAuthError(response, data, providerId);
  if (!providerAuthError) {
    return;
  }

  publishProviderAuthError(providerAuthError);
  throw providerAuthError;
}

function maybeHandleUnauthorized(
  response: Response,
  data: any,
  perPanelInlineLoginEnabled: boolean,
): void {
  if (!perPanelInlineLoginEnabled && (response.status === 401 || data.error === 'token_expired')) {
    handleUnauthorizedResponse(data);
  }
}

function maybeHandleRateLimit(
  response: Response,
  data: any,
  requestPath: string,
  shouldOpenErrorDialog: boolean,
): void {
  if (response.status === 429) {
    handleRateLimitResponse(response, data, requestPath, shouldOpenErrorDialog);
  }
}

function handleApiResponse<T>(
  response: Response,
  data: any,
  options: ApiResponseHandlingOptions,
): T {
  maybeHandleProviderAuthError(response, data, options);
  maybeHandleUnauthorized(response, data, options.perPanelInlineLoginEnabled);
  maybeHandleRateLimit(response, data, options.requestPath, options.shouldOpenErrorDialog);

  if (!response.ok) {
    handleErrorResponse(response, data, options.requestPath, options.shouldOpenErrorDialog);
  }

  return data as T;
}

function handleApiFetchCatch(
  error: unknown,
  perPanelInlineLoginEnabled: boolean,
  url: string,
): never {
  if (isKnownApiError(error)) {
    throw error;
  }

  if (perPanelInlineLoginEnabled && url.startsWith('/api/')) {
    const providerId = getCurrentProviderId();
    const networkAuthError = new ProviderAuthError(
      providerId,
      'network',
      error instanceof Error ? error.message : 'Network request failed',
    );
    publishProviderAuthError(networkAuthError);
    throw networkAuthError;
  }

  throw toNetworkApiError(error);
}

export async function apiFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const perPanelInlineLoginEnabled = isPerPanelInlineLoginEnabled();
  const { suppressErrorDialog, ...fetchOptions } = options;

  try {
    const providerId = getCurrentProviderId();
    const resolvedUrl = withProviderOnApiUrl(url, providerId);
    const headers = new Headers(fetchOptions.headers ?? {});
    if (resolvedUrl.startsWith('/api/') && !headers.has('x-music-provider')) {
      headers.set('x-music-provider', providerId);
    }

    const response = await fetch(resolvedUrl, { ...fetchOptions, headers });
    const data = await parseJsonSafely(response);

    // split()[0] is always defined at runtime; ?? needed for noUncheckedIndexedAccess
    const requestPath = url.split("?")[0] ?? url;
    const shouldOpenErrorDialog = !suppressErrorDialog && process.env.NEXT_PUBLIC_E2E_MODE !== '1';

    return handleApiResponse<T>(response, data, {
      perPanelInlineLoginEnabled,
      resolvedUrl,
      providerId,
      requestPath,
      shouldOpenErrorDialog,
    });
  } catch (error) {
    handleApiFetchCatch(error, perPanelInlineLoginEnabled, url);
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
