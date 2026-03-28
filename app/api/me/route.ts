import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, fromError } from '@/app/api/_shared/http';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';

/**
 * GET /api/me
 *
 * Returns the current user's provider-specific profile (id, displayName).
 */
export async function GET(request: NextRequest) {
  try {
    await assertAuthenticated();
    const { provider } = resolveMusicProviderFromRequest(request);
    const user = await provider.getCurrentUser();

    return ok({ id: user.id, displayName: user.displayName });
  } catch (error) {
    console.error('[api/me] GET Error:', error);
    return fromError(error);
  }
}
