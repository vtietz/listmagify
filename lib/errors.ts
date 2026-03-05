export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'UNPROCESSABLE'
  | 'RATE_LIMIT'
  | 'UPSTREAM_FAILURE'
  | 'FEATURE_DISABLED'
  | 'BAD_REQUEST';

interface AppErrorOptions {
  status: number;
  type?: string;
  detail?: string;
  cause?: unknown;
}

export class AppRouteError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly status: number,
    public readonly type: string,
    public readonly detail?: string,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AppRouteError';
  }
}

function makeError(code: AppErrorCode, message: string, options: AppErrorOptions): AppRouteError {
  return new AppRouteError(
    code,
    message,
    options.status,
    options.type ?? `https://listmagify.dev/problems/${code.toLowerCase().replace('_', '-')}`,
    options.detail,
    options.cause
  );
}

export const routeErrors = {
  badRequest: (message: string, detail?: string) =>
    makeError('BAD_REQUEST', message, { status: 400, ...(detail ? { detail } : {}) }),
  unauthorized: (message = 'Authentication required', detail?: string) =>
    makeError('UNAUTHORIZED', message, { status: 401, ...(detail ? { detail } : {}) }),
  forbidden: (message = 'Forbidden', detail?: string) =>
    makeError('FORBIDDEN', message, { status: 403, ...(detail ? { detail } : {}) }),
  notFound: (message = 'Not found', detail?: string) =>
    makeError('NOT_FOUND', message, { status: 404, ...(detail ? { detail } : {}) }),
  conflict: (message: string, detail?: string) =>
    makeError('CONFLICT', message, { status: 409, ...(detail ? { detail } : {}) }),
  validation: (message: string, detail?: string) =>
    makeError('VALIDATION', message, { status: 400, ...(detail ? { detail } : {}) }),
  unprocessable: (message: string, detail?: string) =>
    makeError('UNPROCESSABLE', message, { status: 422, ...(detail ? { detail } : {}) }),
  rateLimit: (message: string, detail?: string) =>
    makeError('RATE_LIMIT', message, { status: 429, ...(detail ? { detail } : {}) }),
  upstreamFailure: (message: string, detail?: string) =>
    makeError('UPSTREAM_FAILURE', message, { status: 502, ...(detail ? { detail } : {}) }),
  featureDisabled: (message: string, detail?: string) =>
    makeError('FEATURE_DISABLED', message, { status: 503, ...(detail ? { detail } : {}) }),
};

export function isAppRouteError(error: unknown): error is AppRouteError {
  return error instanceof AppRouteError;
}