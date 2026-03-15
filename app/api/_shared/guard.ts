import { routeErrors } from '@/lib/errors';

export async function assertAuthenticated() {
  if (process.env.E2E_MODE === '1') {
    return {
      user: {
        id: 'e2e-user',
        email: 'e2e@example.com',
        name: 'E2E Test User',
      },
    };
  }

  const [{ getServerSession }, { authOptions }] = await Promise.all([
    import('next-auth'),
    import('@/lib/auth/auth'),
  ]);

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