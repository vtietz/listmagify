import { isProviderAuthCode, isProviderId, type ProviderAuthCode, type ProviderId } from '@/lib/providers/types';

export interface ProviderAuthErrorPayload {
  authError: true;
  provider: ProviderId;
  code: ProviderAuthCode;
  message: string;
  retryAfterMs?: number;
}

export class ProviderAuthError extends Error {
  readonly provider: ProviderId;
  readonly code: ProviderAuthCode;
  readonly retryAfterMs: number | undefined;

  constructor(
    provider: ProviderId,
    code: ProviderAuthCode,
    message: string,
    retryAfterMs?: number,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'ProviderAuthError';
    this.provider = provider;
    this.code = code;
    this.retryAfterMs = retryAfterMs;

    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function isAuthError(error: unknown): error is ProviderAuthError {
  return error instanceof ProviderAuthError;
}

export function isProviderAuthErrorPayload(value: unknown): value is ProviderAuthErrorPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    record.authError === true
    && isProviderId(record.provider)
    && isProviderAuthCode(record.code)
    && typeof record.message === 'string'
    && (record.retryAfterMs === undefined || typeof record.retryAfterMs === 'number')
  );
}
