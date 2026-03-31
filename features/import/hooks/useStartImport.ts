import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { useImportActivityStore } from '@/features/import/stores/useImportActivityStore';

interface StartImportParams {
  sourceProvider: string;
  targetProvider: string;
  playlists: Array<{ id: string; name: string }>;
  createSyncPair?: boolean;
  syncInterval?: string;
}

interface StartImportResponse {
  jobId: string;
}

export function useStartImport() {
  const setActiveImport = useImportActivityStore((s) => s.setActiveImport);

  return useMutation({
    mutationFn: async (params: StartImportParams): Promise<StartImportResponse> => {
      return apiFetch<StartImportResponse>('/api/import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProvider: params.sourceProvider,
          targetProvider: params.targetProvider,
          playlists: params.playlists,
          createSyncPair: params.createSyncPair ?? false,
          syncInterval: params.syncInterval ?? 'off',
        }),
      });
    },
    onSuccess: (data: StartImportResponse) => {
      setActiveImport(data.jobId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start import');
    },
  });
}
