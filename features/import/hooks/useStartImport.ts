import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { useImportDialogStore } from '@/features/import/stores/useImportDialogStore';

interface StartImportParams {
  sourceProvider: string;
  targetProvider: string;
  playlists: Array<{ id: string; name: string }>;
}

interface StartImportResponse {
  jobId: string;
}

export function useStartImport() {
  const setActiveJobId = useImportDialogStore((s) => s.setActiveJobId);

  return useMutation({
    mutationFn: async (params: StartImportParams): Promise<StartImportResponse> => {
      return apiFetch<StartImportResponse>('/api/import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProvider: params.sourceProvider,
          targetProvider: params.targetProvider,
          playlists: params.playlists,
        }),
      });
    },
    onSuccess: (data: StartImportResponse) => {
      setActiveJobId(data.jobId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start import');
    },
  });
}
