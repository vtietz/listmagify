import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { routeErrors } from '@/lib/errors';

export async function assertAuthenticated() {
  const session = await getServerSession(authOptions);

  if (!session || (session as { error?: string }).error === 'RefreshAccessTokenError') {
    throw routeErrors.unauthorized('token_expired');
  }

  return session;
}

export function assertFeatureEnabled(enabled: boolean, message: string): void {
  if (!enabled) {
    throw routeErrors.notFound(message);
  }
}

export function assertRequiredHeader(value: string | null, headerName: string): void {
  if (!value || value.trim().length === 0) {
    throw routeErrors.badRequest(`Missing required header: ${headerName}`);
  }
}

export function assertBodyNotEmpty(payload: unknown, message = 'Request body is required'): void {
  if (!payload || typeof payload !== 'object' || Object.keys(payload as Record<string, unknown>).length === 0) {
    throw routeErrors.badRequest(message);
  }
}