/**
 * Simple rate limit/backoff utilities for Spotify Web API requests.
 * - Retries on 429 (respecting Retry-After header) and some transient 5xx
 * - Exponential backoff with jitter for other transient errors
 */

export type BackoffOptions = {
  maxRetries?: number;
  baseDelayMs?: number; // initial delay for exponential backoff
  maxDelayMs?: number;  // cap for backoff delay
  sameKindAbortAfterRetries?: number; // abort after N consecutive retries of the same error kind
};

export type RateLimitLogContext = {
  requestPath?: string;
  providerId?: string;
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
  sameKindAbortAfterRetries: 10,
};

type RetryKind = 'network' | 'rate-limit' | 'server-5xx';

type RetryStreak = {
  kind: RetryKind;
  count: number;
};

const retryStreakByScope = new Map<string, RetryStreak>();

function parseRetryBudgetFromEnv(): number | undefined {
  const raw = process.env.PROVIDER_SAME_KIND_RETRY_ABORT_AFTER;
  if (!raw) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function noteRetry(scope: string, kind: RetryKind): number {
  const current = retryStreakByScope.get(scope);
  const next: RetryStreak = current?.kind === kind
    ? { kind, count: current.count + 1 }
    : { kind, count: 1 };
  retryStreakByScope.set(scope, next);
  return next.count;
}

function clearRetryStreak(scope: string): void {
  retryStreakByScope.delete(scope);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function expBackoff(attempt: number, base: number, cap: number): number {
  const expo = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
  // Full jitter
  return Math.floor(Math.random() * (expo + 1));
}

function getBackoffDelayMs(attempt: number, cfg: Required<BackoffOptions>): number {
  return expBackoff(attempt, cfg.baseDelayMs, cfg.maxDelayMs);
}

function getRetryAfterDelayMs(
  retryAfter: string | null,
  attempt: number,
  cfg: Required<BackoffOptions>
): number {
  const waitSec = retryAfter ? Number(retryAfter) : NaN;
  return Number.isFinite(waitSec) ? waitSec * 1000 : getBackoffDelayMs(attempt, cfg);
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
  requestPathOrContext?: string | RateLimitLogContext
): Promise<Response> {
  const envRetryBudget = parseRetryBudgetFromEnv();
  const sameKindAbortAfterRetries = opts.sameKindAbortAfterRetries
    ?? envRetryBudget
    ?? defaultBackoff.sameKindAbortAfterRetries;
  const cfg: Required<BackoffOptions> = {
    maxRetries: opts.maxRetries ?? defaultBackoff.maxRetries,
    baseDelayMs: opts.baseDelayMs ?? defaultBackoff.baseDelayMs,
    maxDelayMs: opts.maxDelayMs ?? defaultBackoff.maxDelayMs,
    sameKindAbortAfterRetries,
  };
  const maxWaitMs = 60 * 60 * 1000;
  const context: RateLimitLogContext = typeof requestPathOrContext === 'string'
    ? { requestPath: requestPathOrContext }
    : (requestPathOrContext ?? {});
  const requestPath = context.requestPath;
  const logTag = context.providerId ? `[provider:${context.providerId}]` : '[provider]';
  const retryScope = context.providerId ?? 'unknown';

  const shouldAbortForStreak = (kind: RetryKind): boolean => {
    const streak = noteRetry(retryScope, kind);
    return streak >= cfg.sameKindAbortAfterRetries;
  };

  for (let attempt = 1; attempt <= cfg.maxRetries + 1; attempt += 1) {
    let res: Response;

    try {
      res = await fetchFactory();
    } catch (err) {
      if (shouldAbortForStreak('network')) {
        throw new Error(`${logTag} aborting after ${cfg.sameKindAbortAfterRetries} consecutive network retries`);
      }

      if (attempt > cfg.maxRetries) {
        throw err;
      }

      const delay = getBackoffDelayMs(attempt, cfg);
      console.warn(`${logTag} network error, retrying in ${delay}ms (attempt ${attempt}/${cfg.maxRetries})`, err);
      await sleep(delay);
      continue;
    }

    // Success
    if (res.ok) {
      clearRetryStreak(retryScope);
      return res;
    }

    // 429 Too Many Requests - honor Retry-After
    if (res.status === 429) {
      const delayMs = getRetryAfterDelayMs(res.headers.get('Retry-After'), attempt, cfg);

      if (shouldAbortForStreak('rate-limit')) {
        throw new RateLimitError(delayMs, requestPath);
      }

      // If retry time is very long (> 1 hour), don't wait - throw immediately
      if (delayMs > maxWaitMs) {
        console.warn(`${logTag} 429 with long wait (${Math.ceil(delayMs / 1000)}s), throwing RateLimitError`);
        throw new RateLimitError(delayMs, requestPath);
      }

      if (attempt > cfg.maxRetries) {
        console.warn(`${logTag} 429 and maxRetries reached, throwing RateLimitError`);
        throw new RateLimitError(delayMs, requestPath);
      }

      console.warn(`${logTag} 429 received, retry after ${delayMs}ms (attempt ${attempt}/${cfg.maxRetries})`);
      await sleep(delayMs);
      continue;
    }

    // Retry select transient 5xx
    if (res.status >= 500 && res.status < 600 && attempt <= cfg.maxRetries) {
      if (shouldAbortForStreak('server-5xx')) {
        throw new Error(`${logTag} aborting after ${cfg.sameKindAbortAfterRetries} consecutive 5xx retries`);
      }

      const delay = getBackoffDelayMs(attempt, cfg);
      console.warn(`${logTag} ${res.status} server error, retrying in ${delay}ms (attempt ${attempt}/${cfg.maxRetries})`);
      await sleep(delay);
      continue;
    }

    // Non-retryable or retries exhausted
    return res;
  }

  throw new Error(`${logTag} retry loop exhausted unexpectedly`);
}