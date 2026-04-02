'use client';

import { Cog } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { SyncSchedulerCard } from '@/components/stats/cards/SyncSchedulerCard';
import { ImportJobsCard } from '@/components/stats/cards/ImportJobsCard';
import { TokenStatusCard } from '@/components/stats/cards/TokenStatusCard';

export function BackgroundTasksSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'background-tasks'],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch('/api/stats/background-tasks', { signal });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const taskData = data?.data;

  return (
    <section id="background-tasks" className="scroll-mt-28 space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Cog className="h-6 w-6" />
        Background Tasks
      </h2>

      <SyncSchedulerCard
        data={taskData?.syncScheduler}
        workerEnabled={taskData?.workerStatus?.syncSchedulerEnabled}
        isLoading={isLoading}
      />
      <ImportJobsCard
        data={taskData?.importJobs}
        isLoading={isLoading}
      />
      <TokenStatusCard
        data={taskData?.tokenStatus}
        keepaliveEnabled={taskData?.workerStatus?.tokenKeepaliveEnabled}
        isLoading={isLoading}
      />
    </section>
  );
}
