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
 */
export async function withRateLimitRetry<T>(
  fetchFactory: () => Promise<Response>,
  opts: BackoffOptions = {}
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
      if (attempt > cfg.maxRetries) {
        console.warn(`[spotify] 429 and maxRetries reached, giving up`);
        return res;
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