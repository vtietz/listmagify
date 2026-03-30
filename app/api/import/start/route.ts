import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { created, badRequest, conflict, fromError } from '@/app/api/_shared/http';
import { createImportJob, getActiveImportJob } from '@/lib/import/importStore';
import { executeImportJob } from '@/lib/import/importRunner';

/**
 * POST /api/import/start
 *
 * Start a bulk playlist import job from one provider to another.
 *
 * Request body:
 *   { sourceProvider, targetProvider, playlists: [{ id, name }] }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await assertAuthenticated();
    const body = await request.json();

    // Validate required fields
    if (!body.sourceProvider || !body.targetProvider) {
      return badRequest('Missing required fields: sourceProvider, targetProvider');
    }

    if (!Array.isArray(body.playlists) || body.playlists.length === 0) {
      return badRequest('playlists must be a non-empty array');
    }

    for (const playlist of body.playlists) {
      if (!playlist.id || !playlist.name) {
        return badRequest('Each playlist must have an id and name');
      }
    }

    if (body.sourceProvider === body.targetProvider) {
      return badRequest('sourceProvider and targetProvider must be different');
    }

    // Check for existing active import job
    const activeJob = getActiveImportJob(session.user.id);
    if (activeJob) {
      return conflict('An import job is already in progress', `Active job: ${activeJob.id}`);
    }

    // Create the job
    const job = createImportJob({
      sourceProvider: String(body.sourceProvider),
      targetProvider: String(body.targetProvider),
      createdBy: session.user.id,
      playlists: body.playlists.map((p: { id: string; name: string }) => ({
        id: String(p.id),
        name: String(p.name),
      })),
    });

    // Fire and forget -- execute in background
    void executeImportJob(job.id).catch((err) => {
      console.error('[api/import/start] background execution failed', {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return created({ jobId: job.id });
  } catch (error) {
    console.error('[api/import/start] Error:', error);
    return fromError(error);
  }
}
