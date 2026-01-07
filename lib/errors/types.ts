/**
 * Centralized error types for application-wide error handling.
 * These types define the structure for capturing, reporting, and displaying errors.
 */

/**
 * Error severity levels for categorization and UI treatment
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Error categories for grouping related errors
 */
export type ErrorCategory = 
  | 'rate_limit'      // Spotify API rate limiting (429)
  | 'auth'            // Authentication/session errors
  | 'network'         // Network connectivity issues
  | 'api'             // General API errors
  | 'validation'      // Input/data validation errors
  | 'unknown';        // Uncategorized errors

/**
 * Structured error information for reporting and display
 */
export interface AppError {
  /** Unique identifier for this error instance */
  id: string;
  /** ISO timestamp when the error occurred */
  timestamp: string;
  /** Human-readable error message */
  message: string;
  /** Detailed technical description (for reports) */
  details?: string;
  /** Error category for grouping */
  category: ErrorCategory;
  /** Severity level */
  severity: ErrorSeverity;
  /** HTTP status code if applicable */
  statusCode?: number;
  /** Stack trace (sanitized, no sensitive data) */
  stack?: string;
  /** Request URL that caused the error (path only, no query params) */
  requestPath?: string;
  /** Additional context (non-sensitive) */
  context?: Record<string, string | number | boolean>;
  /** Retry information for rate limits */
  retryAfter?: {
    /** Seconds until retry is allowed */
    seconds: number;
    /** ISO timestamp when retry is allowed */
    retryAt: string;
  };
  /** Whether the user has been notified */
  userNotified: boolean;
  /** Whether the error has been reported */
  reported: boolean;
}

/**
 * Error report payload sent to the server
 */
export interface ErrorReport {
  /** The error being reported */
  error: AppError;
  /** Optional user-provided description */
  userDescription?: string;
  /** Browser/environment info (non-identifying) */
  environment: {
    userAgent: string;
    language: string;
    platform: string;
    screenSize: string;
    timestamp: string;
  };
  /** App version/build info */
  appVersion: string;
}

/**
 * Response from error report submission
 */
export interface ErrorReportResponse {
  success: boolean;
  message: string;
  reportId?: string;
}

/**
 * Create a new AppError with defaults
 */
export function createAppError(
  partial: Partial<AppError> & Pick<AppError, 'message' | 'category'>
): AppError {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    severity: 'error',
    userNotified: false,
    reported: false,
    ...partial,
  };
}

/**
 * Create a rate limit error with retry information
 */
export function createRateLimitError(
  retryAfterMs: number,
  requestPath?: string
): AppError {
  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
  const retryAt = new Date(Date.now() + retryAfterMs).toISOString();
  
  // Format human-readable wait time
  const hours = Math.floor(retryAfterSeconds / 3600);
  const minutes = Math.floor((retryAfterSeconds % 3600) / 60);
  
  let waitTime = '';
  if (hours > 0) {
    waitTime = `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) waitTime += ` ${minutes} min`;
  } else if (minutes > 0) {
    waitTime = `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    waitTime = `${retryAfterSeconds} seconds`;
  }
  
  return createAppError({
    message: `Spotify API rate limit exceeded. Please wait ${waitTime} before trying again.`,
    details: `The Spotify API has temporarily blocked requests due to rate limiting. This usually happens after many rapid API calls. The app will automatically retry when the limit resets.`,
    category: 'rate_limit',
    severity: 'warning',
    statusCode: 429,
    requestPath,
    retryAfter: {
      seconds: retryAfterSeconds,
      retryAt,
    },
  });
}

/**
 * Check if error reporting is enabled and properly configured
 * This is called from the client to determine if the report button should be shown
 */
export function isErrorReportingAvailable(): boolean {
  // Check if running in browser
  if (typeof window === 'undefined') return false;
  
  // This will be checked server-side when submitting
  // For now, we optimistically show the button and handle errors on submission
  return true;
}

/**
 * Sanitize a stack trace to remove potentially sensitive information
 */
export function sanitizeStack(stack?: string): string | undefined {
  if (!stack) return undefined;
  
  // Remove file paths that might contain usernames
  // Keep only the function names and line numbers
  return stack
    .split('\n')
    .slice(0, 10) // Limit to 10 frames
    .map(line => {
      // Remove absolute paths, keep relative paths
      return line.replace(/\(\/[^)]+\/([^/]+)\)/, '($1)');
    })
    .join('\n');
}
