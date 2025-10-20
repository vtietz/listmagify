/**
 * Debug logging utilities with environment-aware guards.
 * Only logs in development mode when NEXT_PUBLIC_DEBUG is enabled.
 */

/**
 * Checks if debug mode is enabled.
 * @returns true if debug logging should be active
 */
export function isDebug(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG === 'true';
}

/**
 * Logs to console only if debug mode is enabled.
 * No-op in production or when debug flag is disabled.
 * 
 * @param args - Arguments to pass to console.log
 * 
 * @example
 * ```ts
 * logDebug('[DragEnd] Operation:', { mode, playlistId });
 * // Only logs if NEXT_PUBLIC_DEBUG=true
 * ```
 */
export function logDebug(...args: unknown[]): void {
  if (isDebug()) {
    console.log(...args);
  }
}
