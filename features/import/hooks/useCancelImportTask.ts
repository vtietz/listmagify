'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';

interface CancelResponse {
  cancelled: boolean;
}

export function useCancelImportTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (playlistEntryId: string): Promise<CancelResponse> => {
      return apiFetch<CancelResponse>('/api/import/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistEntryId }),
      });
    },
    onSuccess: (data: CancelResponse) => {
      if (data.cancelled) {
        queryClient.invalidateQueries({ queryKey: ['import-history'] });
        queryClient.invalidateQueries({ queryKey: ['import-job'] });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel task');
    },
  });
}
