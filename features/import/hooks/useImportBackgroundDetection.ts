'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { useImportActivityStore } from '@/features/import/stores/useImportActivityStore';
import { useImportJob, type ImportJobData } from '@/features/import/hooks/useImportJob';

interface ActiveImportResponse {
  activeJob: { id: string; status: string } | null;
}

/**
 * Detects active import jobs on page load and tracks their completion.
 * Mount once at the AppShell level.
 */
export function useImportBackgroundDetection() {
  const setActiveImport = useImportActivityStore((s) => s.setActiveImport);
  const markImportCompleted = useImportActivityStore((s) => s.markImportCompleted);
  const activeJobId = useImportActivityStore((s) => s.activeImportJobId);
  const queryClient = useQueryClient();
  const hasNotified = useRef(false);

  // Check for active import on mount
  const { data } = useQuery({
    queryKey: ['import-active-check'],
    queryFn: () => apiFetch<ActiveImportResponse>('/api/import/active'),
    staleTime: Infinity,
    gcTime: 0,
  });

  // Populate activity store if active job found and store is empty
  useEffect(() => {
    if (data?.activeJob && !activeJobId) {
      setActiveImport(data.activeJob.id);
    }
  }, [data, activeJobId, setActiveImport]);

  // Poll the active job for completion
  const importJobQuery = useImportJob(activeJobId);
  const jobData: ImportJobData | undefined = importJobQuery.data;

  // Handle job completion
  useEffect(() => {
    if (!jobData || !activeJobId) return;

    const { status } = jobData.job;
    if (status !== 'done' && status !== 'failed') return;
    if (hasNotified.current) return;

    hasNotified.current = true;
    markImportCompleted(status);
    void queryClient.invalidateQueries({ queryKey: ['import-history'] });

    const total = jobData.playlists.length;
    const done = jobData.playlists.filter((p) => p.status === 'done').length;
    const partial = jobData.playlists.filter((p) => p.status === 'partial').length;

    if (status === 'done') {
      const parts: string[] = [];
      if (done > 0) parts.push(`${done} imported`);
      if (partial > 0) parts.push(`${partial} partial`);
      toast.success(`Import complete: ${parts.join(', ')}`);
    } else {
      toast.error(`Import failed for ${total} playlist${total === 1 ? '' : 's'}`);
    }
  }, [jobData, activeJobId, markImportCompleted, queryClient]);

  // Reset notification flag when job changes
  useEffect(() => {
    hasNotified.current = false;
  }, [activeJobId]);
}
