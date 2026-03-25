import { NextResponse } from "next/server";
import { RateLimitError } from "@/lib/spotify/rateLimit";
import { isAppRouteError } from '@/lib/errors';
import { ServerAuthError } from '@/lib/auth/requireAuth';
import { ProviderApiError } from '@/lib/music-provider/types';
import {
  ProviderAuthError,
  isProviderAuthErrorPayload,
  type ProviderAuthErrorPayload,
} from '@/lib/providers/errors';
import type { ProviderAuthCode, ProviderId } from '@/lib/providers/types';

/**
 * Standard error response format for API routes.
 * Includes rate limit information when applicable.
 */
export interface ApiErrorResponse {
  error: string;
  code?: string;
  authError?: boolean;
  provider?: ProviderId;
  retryAfterMs?: number;
  rateLimitInfo?: {
    retryAfterMs: number;
    retryAt: string;
  };
}

function getStatusForAuthCode(code: ProviderAuthCode): number {
  if (code === 'insufficient_scope') {
    return 403;
  }

  if (code === 'rate_limited') {
    return 429;
  }

  if (code === 'provider_unavailable') {
    return 503;
  }

  return 401;
}

function mapServerAuthReasonToCode(reason: ServerAuthError['reason']): ProviderAuthCode {
  if (reason === 'refresh_failed' || reason === 'token_expired') {
    return 'expired';
  }

  return 'unauthenticated';
}

function mapProviderApiStatusToCode(status: number): ProviderAuthCode | null {
  if (status === 401) {
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

function parseRetryAfterMsFromDetails(details: string | undefined): number | undefined {
  if (!details) {
    return undefined;
  }

  const msMatch = details.match(/retryAfterMs[:=]\s*(\d+)/i);
  if (msMatch?.[1]) {
    return Number.parseInt(msMatch[1], 10);
  }

  const secondsMatch = details.match(/retryAfter[:=]\s*(\d+)/i);
  if (secondsMatch?.[1]) {
    return Number.parseInt(secondsMatch[1], 10) * 1000;
  }

  const fallbackSecondsMatch = details.match(/retry[-_\s]?after[:=]\s*(\d+)/i);
  if (fallbackSecondsMatch?.[1]) {
    return Number.parseInt(fallbackSecondsMatch[1], 10) * 1000;
  }

  return undefined;
}

function isPremiumRequiredMessage(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return normalized.includes('premium_required') || normalized.includes('premium subscription');
}

function toProviderAuthErrorFromPayload(payload: ProviderAuthErrorPayload): ProviderAuthError {
  return new ProviderAuthError(
    payload.provider,
    payload.code,
    payload.message,
    payload.retryAfterMs,
  );
}

function mapServerAuthError(
  error: unknown,
  providerHint: ProviderId,
): ProviderAuthError | null {
  if (!(error instanceof ServerAuthError)) {
    return null;
  }

  return new ProviderAuthError(
    providerHint,
    mapServerAuthReasonToCode(error.reason),
    error.message,
  );
}

function mapProviderApiError(error: unknown): ProviderAuthError | null {
  if (!(error instanceof ProviderApiError)) {
    return null;
  }

  if (error.status === 403 && isPremiumRequiredMessage(`${error.message} ${error.details ?? ''}`)) {
    return null;
  }

  const mappedCode = mapProviderApiStatusToCode(error.status);
  if (!mappedCode) {
    return null;
  }

  const authCode = error.status === 401 && (error.details === 'token_expired' || error.details === 'refresh_failed')
    ? 'expired'
    : mappedCode;

  const retryAfterMs = authCode === 'rate_limited'
    ? parseRetryAfterMsFromDetails(error.details)
    : undefined;

  return new ProviderAuthError(
    error.provider,
    authCode,
    error.message,
    retryAfterMs,
  );
}

function mapAppRouteToProviderAuthError(
  error: unknown,
  providerHint: ProviderId,
): ProviderAuthError | null {
  if (!isAppRouteError(error)) {
    return null;
  }

  if (error.status === 403 && isPremiumRequiredMessage(`${error.message} ${error.detail ?? ''}`)) {
    return null;
  }

  const mappedCode = mapProviderApiStatusToCode(error.status);
  if (!mappedCode) {
    return null;
  }

  const message = error.detail ?? error.message;
  return new ProviderAuthError(providerHint, mappedCode, message);
}

function mapProviderPayloadError(error: unknown): ProviderAuthError | null {
  if (!isProviderAuthErrorPayload(error)) {
    return null;
  }

  return toProviderAuthErrorFromPayload(error);
}

/**
 * Map arbitrary API-layer errors to unified provider auth errors when possible.
 */
export function mapApiErrorToProviderAuthError(
  error: unknown,
  providerHint: ProviderId = 'spotify',
): ProviderAuthError | null {
  if (error instanceof ProviderAuthError) {
    return error;
  }

  return (
    mapServerAuthError(error, providerHint)
    ?? mapProviderApiError(error)
    ?? mapAppRouteToProviderAuthError(error, providerHint)
    ?? mapProviderPayloadError(error)
  );
}

export function toProviderAuthErrorPayload(error: ProviderAuthError): ProviderAuthErrorPayload {
  return {
    authError: true,
    provider: error.provider,
    code: error.code,
    message: error.message,
    ...(typeof error.retryAfterMs === 'number' ? { retryAfterMs: error.retryAfterMs } : {}),
  };
}

export function toProviderAuthErrorResponse(error: ProviderAuthError): NextResponse {
  const body = toProviderAuthErrorPayload(error);
  const status = getStatusForAuthCode(error.code);

  const headers = error.code === 'rate_limited' && typeof error.retryAfterMs === 'number'
    ? { 'Retry-After': Math.max(1, Math.ceil(error.retryAfterMs / 1000)).toString() }
    : undefined;

  return NextResponse.json(body, {
    status,
    ...(headers ? { headers } : {}),
  });
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
  const authError = mapApiErrorToProviderAuthError(error);
  if (authError) {
    return toProviderAuthErrorResponse(authError);
  }

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
