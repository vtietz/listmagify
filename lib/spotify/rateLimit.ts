/**
 * Simple rate limit/backoff utilities for Spotify Web API requests.
 * - Retries on 429 (respecting Retry-After header) and some transient 5xx
 * - Exponential backoff with jitter for other transient errors
 */

export type BackoffOptions = {
  maxRetries?: number;
  baseDelayMs?: number; // initial delay for exponential backoff
  maxDelayMs?: number;  // cap for backoff delay
};

/**
 * Custom error for rate limit exceeded (429).
 * Includes retry information for client-side handling.
 */
export class RateLimitError extends Error {
  public readonly retryAfterMs: number;
  public readonly retryAt: Date;
  public readonly statusCode = 429;
  public readonly requestPath?: string;

  constructor(retryAfterMs: number, requestPath?: string) {
    const retryAt = new Date(Date.now() + retryAfterMs);
    const seconds = Math.ceil(retryAfterMs / 1000);
    const humanTime = formatRetryTime(seconds);
    super(`Spotify rate limit exceeded. Retry after ${humanTime}.`);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.retryAt = retryAt;
    if (requestPath !== undefined) {
      this.requestPath = requestPath;
    }
  }
}

/**
 * Format seconds into human-readable time
 */
function formatRetryTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    if (minutes > 0) return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} min`;
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

const defaultBackoff: Required<BackoffOptions> = {
  maxRetries: 4,
  baseDelayMs: 400,
  maxDelayMs: 8_000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function expBackoff(attempt: number, base: number, cap: number): number {
  const expo = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
  // Full jitter
  return Math.floor(Math.random() * (expo + 1));
}

/**
 * Wrap a fetch-call factory with retry/backoff.
 * The factory is re-invoked for each retry to allow recalculating headers/etc.
 * 
 * @throws {RateLimitError} When rate limit is exceeded and max retries reached
 */
export async function withRateLimitRetry(
  fetchFactory: () => Promise<Response>,
  opts: BackoffOptions = {},
  requestPath?: string
): Promise<Response> {
  const cfg = { ...defaultBackoff, ...opts };

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    let res: Response;
    try {
      res = await fetchFactory();
    } catch (err) {
      if (attempt > cfg.maxRetries) {
        throw err;
      }
      const delay = expBackoff(attempt, cfg.baseDelayMs, cfg.maxDelayMs);
      console.warn(`[spotify] network error, retrying in ${delay}ms (attempt ${attempt}/${cfg.maxRetries})`, err);
      await sleep(delay);
      continue;
    }

    // Success
    if (res.ok) return res;

    // 429 Too Many Requests - honor Retry-After
    if (res.status === 429) {
      const ra = res.headers.get("Retry-After");
      const waitSec = ra ? Number(ra) : NaN;
      const delayMs = Number.isFinite(waitSec) ? waitSec * 1000 : expBackoff(attempt, cfg.baseDelayMs, cfg.maxDelayMs);
      
      // If retry time is very long (> 1 hour), don't wait - throw immediately
      const maxWaitMs = 60 * 60 * 1000; // 1 hour
      if (delayMs > maxWaitMs) {
        console.warn(`[spotify] 429 with long wait (${Math.ceil(delayMs / 1000)}s), throwing RateLimitError`);
        throw new RateLimitError(delayMs, requestPath);
      }
      
      if (attempt > cfg.maxRetries) {
        console.warn(`[spotify] 429 and maxRetries reached, throwing RateLimitError`);
        throw new RateLimitError(delayMs, requestPath);
      }
      console.warn(`[spotify] 429 received, retry after ${delayMs}ms (attempt ${attempt}/${cfg.maxRetries})`);
      await sleep(delayMs);
      continue;
    }

    // Retry select transient 5xx
    if (res.status >= 500 && res.status < 600 && attempt <= cfg.maxRetries) {
      const delay = expBackoff(attempt, cfg.baseDelayMs, cfg.maxDelayMs);
      console.warn(`[spotify] ${res.status} server error, retrying in ${delay}ms (attempt ${attempt}/${cfg.maxRetries})`);
      await sleep(delay);
      continue;
    }

    // Non-retryable or retries exhausted
    return res;
  }
}