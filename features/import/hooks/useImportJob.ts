import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { useState, useEffect } from 'react';

type JobStatus = 'pending' | 'running' | 'done' | 'failed';
type PlaylistImportStatus =
  | 'queued'
  | 'creating'
  | 'resolving_tracks'
  | 'adding_tracks'
  | 'done'
  | 'failed'
  | 'partial';

interface ImportJobPlaylistEntry {
  id: string;
  sourcePlaylistId: string;
  sourcePlaylistName: string;
  targetPlaylistId: string | null;
  status: PlaylistImportStatus;
  trackCount: number;
  tracksResolved: number;
  tracksAdded: number;
  tracksUnresolved: number;
  errorMessage: string | null;
}

/** Shape returned by GET /api/import/status */
interface ImportStatusResponse {
  job: {
    id: string;
    sourceProvider: string;
    targetProvider: string;
    status: JobStatus;
    createdAt: string;
    completedAt: string | null;
    totalPlaylists: number;
    completedPlaylists: number;
    playlists: ImportJobPlaylistEntry[];
  };
}

/** Normalised shape exposed to UI components */
export interface ImportJobData {
  job: {
    id: string;
    sourceProvider: string;
    targetProvider: string;
    status: JobStatus;
    createdAt: string;
    completedAt: string | null;
    totalPlaylists: number;
    completedPlaylists: number;
  };
  playlists: ImportJobPlaylistEntry[];
}

function normalise(raw: ImportStatusResponse): ImportJobData {
  const { playlists, ...jobFields } = raw.job;
  return { job: jobFields, playlists };
}

function isTerminalStatus(status: JobStatus): boolean {
  return status === 'done' || status === 'failed';
}

const POLL_INTERVAL_MS = 2000;

export function useImportJob(jobId: string | null) {
  const queryClient = useQueryClient();
  const [isComplete, setIsComplete] = useState(false);
  const [hasInvalidated, setHasInvalidated] = useState(false);

  // Reset when jobId changes
  useEffect(() => {
    setIsComplete(false);
    setHasInvalidated(false);
  }, [jobId]);

  const query = useQuery<ImportJobData>({
    queryKey: ['import-job', jobId],
    queryFn: async () => {
      const raw = await apiFetch<ImportStatusResponse>(
        `/api/import/status?jobId=${encodeURIComponent(jobId!)}`,
      );
      return normalise(raw);
    },
    enabled: jobId !== null,
    refetchInterval: isComplete ? false : POLL_INTERVAL_MS,
    staleTime: 0,
  });

  const jobStatus = query.data?.job.status;
  const targetProvider = query.data?.job.targetProvider;

  // Stop polling once the job reaches a terminal status
  useEffect(() => {
    if (jobStatus && isTerminalStatus(jobStatus)) {
      setIsComplete(true);
    }
  }, [jobStatus]);

  // Invalidate playlist cache once when job completes
  useEffect(() => {
    if (!jobStatus || !targetProvider) return;
    if (!isTerminalStatus(jobStatus)) return;
    if (hasInvalidated) return;

    setHasInvalidated(true);
    void queryClient.invalidateQueries({ queryKey: ['user-playlists'] });
  }, [jobStatus, targetProvider, queryClient, hasInvalidated]);

  return query;
}
