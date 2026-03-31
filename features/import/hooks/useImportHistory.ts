'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { ImportJobWithPlaylists } from '@/lib/import/types';
import { useImportActivityStore } from '@/features/import/stores/useImportActivityStore';

interface ImportHistoryResponse {
  jobs: ImportJobWithPlaylists[];
  activeJobId: string | null;
}

export function useImportHistory(enabled = true) {
  const isImportActive = useImportActivityStore((s) => s.isImportActive);

  return useQuery({
    queryKey: ['import-history'],
    queryFn: async () => {
      return apiFetch<ImportHistoryResponse>('/api/import/history?limit=20');
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled && isImportActive ? 3000 : false,
  });
}
