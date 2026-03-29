import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, badRequest, fromError } from '@/app/api/_shared/http';
import { applySyncPlanWithRun } from '@/lib/sync/runner';
import type { SyncPlan } from '@/lib/sync/types';

/**
 * POST /api/sync/apply
 *
 * Apply a pre-computed sync plan without re-running preview.
 * The plan is sent in the request body.
 *
 * Body: { plan: SyncPlan, syncPairId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    await assertAuthenticated();

    const body = await request.json();

    if (!body.plan || !body.plan.items || !body.plan.sourceProvider || !body.plan.targetProvider) {
      return badRequest('Missing or invalid plan in request body');
    }

    const plan = body.plan as SyncPlan;
    const syncPairId = typeof body.syncPairId === 'string' ? body.syncPairId : undefined;

    const outcome = await applySyncPlanWithRun(plan, syncPairId);
    return ok(outcome);
  } catch (error) {
    console.error('[api/sync/apply] Error:', error);
    return fromError(error);
  }
}
