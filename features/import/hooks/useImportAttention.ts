'use client';

import { useMemo } from 'react';
import { useImportHistory } from './useImportHistory';
import type { ImportJobWithPlaylists } from '@/lib/import/types';

function jobNeedsAttention(job: ImportJobWithPlaylists): boolean {
  if (job.status === 'failed') return true;
  if (job.status !== 'done') return false;

  return job.playlists.some(
    (p) => p.status === 'failed' || p.status === 'partial',
  );
}

/**
 * Returns the number of recent import jobs that need user attention
 * (failed entirely, or completed with failed/partial playlists).
 *
 * Used to show a warning badge on the Import nav button.
 */
export function useImportAttention(enabled = true) {
  const { data } = useImportHistory(enabled);

  const attentionCount = useMemo(() => {
    if (!data?.jobs) return 0;
    return data.jobs.filter(jobNeedsAttention).length;
  }, [data?.jobs]);

  return { attentionCount };
}
