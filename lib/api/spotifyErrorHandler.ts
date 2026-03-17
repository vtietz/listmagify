/**
 * Centralized error handling for Spotify API responses
 * Provides consistent error responses and logging across all API routes
 */

import { NextResponse } from 'next/server';

export interface SpotifyErrorOptions {
  /** The operation being performed (for logging) */
  operation?: string;
  /** The API path that was called (for logging) */
  path?: string;
  /** Additional context for logging */
  context?: Record<string, any>;
}

function handle403Response(text: string): NextResponse {
  if (text.toLowerCase().includes('user may not be registered') ||
      text.toLowerCase().includes('developer.spotify.com/dashboard')) {
    return NextResponse.json(
      {
        error: 'user_not_approved',
        message: 'Your Spotify account is not approved for this app yet',
        details: 'Please request access from the homepage or contact the administrator to be added to the approved users list'
      },
      { status: 403 }
    );
  }

  if (text.toLowerCase().includes('premium')) {
    return NextResponse.json(
      {
        error: 'premium_required',
        message: 'Spotify Premium is required to control playback',
        details: 'You can still use this app to organize your playlists!'
      },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      error: 'insufficient_permissions',
      message: 'Missing required Spotify permissions',
      details: text || 'Required scope may be missing from authorization'
    },
    { status: 403 }
  );
}

function handle429Response(response: Response): NextResponse {
  const retryAfter = response.headers.get('Retry-After') || '60';
  return NextResponse.json(
    { error: 'rate_limited', message: 'Spotify API rate limit exceeded', retryAfter: parseInt(retryAfter, 10) },
    { status: 429 }
  );
}

function buildDefaultSpotifyError(status: number, text: string, statusText: string): NextResponse {
  return NextResponse.json(
    { error: 'spotify_api_error', message: `Spotify API returned ${status}`, details: text || statusText },
    { status: status >= 500 ? 503 : status }
  );
}

const SERVICE_UNAVAILABLE_RESPONSE = NextResponse.json(
  { error: 'service_unavailable', message: 'Spotify service temporarily unavailable', details: 'Please try again in a moment' },
  { status: 503 }
);

function isServiceUnavailable(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

/**
 * Handle a Spotify API response that returned a non-OK status
 * Returns appropriate NextResponse with standardized error structure
 */
export async function handleSpotifyResponseError(
  response: Response,
  options: SpotifyErrorOptions = {}
): Promise<NextResponse> {
  const operation = options.operation ?? 'Spotify API call';
  const status = response.status;
  const text = await response.text().catch(() => '');

  console.error(`[${operation}] Error:`, {
    status,
    path: options.path,
    response: text,
    timestamp: new Date().toISOString(),
    ...options.context
  });

  if (isServiceUnavailable(status)) return SERVICE_UNAVAILABLE_RESPONSE;

  switch (status) {
    case 204:
      return NextResponse.json({ data: null });

    case 401:
      return NextResponse.json(
        { error: 'token_expired', message: 'Spotify token expired or invalid', details: 'Please refresh the page to re-authenticate' },
        { status: 401 }
      );

    case 403:
      return handle403Response(text);

    case 404:
      return NextResponse.json(
        { error: 'not_found', message: 'Resource not found', details: text || 'The requested Spotify resource does not exist' },
        { status: 404 }
      );

    case 429:
      return handle429Response(response);

    default:
      return buildDefaultSpotifyError(status, text, response.statusText);
  }
}

/**
 * Handle exceptions thrown during Spotify API calls
 * Returns appropriate NextResponse based on error type
 */
export function handleSpotifyException(
  error: any,
  options: SpotifyErrorOptions = {}
): NextResponse {
  const { operation = 'Spotify API call', context } = options;
  
  console.error(`[${operation}] Unexpected error:`, {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    ...context
  });
  
  // Handle authentication errors from spotifyFetch
  if (error.message?.includes('Missing access token') || 
      error.message?.includes('not authenticated')) {
    return NextResponse.json(
      { 
        error: 'token_expired', 
        message: 'Authentication required',
        details: 'Session expired or missing'
      },
      { status: 401 }
    );
  }
  
  // Handle network/timeout errors
  if (error.name === 'TypeError' || error.message?.includes('fetch')) {
    return NextResponse.json(
      { 
        error: 'network_error', 
        message: 'Network error communicating with Spotify',
        details: 'Please check your connection and try again'
      },
      { status: 503 }
    );
  }
  
  // Generic internal error
  return NextResponse.json(
    { 
      error: 'internal_error', 
      message: 'An unexpected error occurred',
      details: error.message 
    },
    { status: 500 }
  );
}
