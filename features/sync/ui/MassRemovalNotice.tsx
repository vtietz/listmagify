import { AlertTriangle } from 'lucide-react';
import { getProviderDisplayName } from '@/lib/music-provider/providerLabels';
import type { SyncPlan } from '@/lib/sync/types';

/**
 * Shown when the plan removes an unusually large share of a playlist. Scheduled
 * syncs hold such plans; applying the preview is the user's confirmation.
 */
export function MassRemovalNotice({ plan }: { plan: SyncPlan | null }) {
  const warnings = plan?.massRemoval;
  if (!warnings || warnings.length === 0) return null;

  return (
    <div
      role="alert"
      className="flex gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-300"
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="space-y-1">
        {warnings.map((warning) => (
          <p key={warning.provider}>
            {warning.count} of {warning.total} tracks will be removed from {getProviderDisplayName(warning.provider)}.
          </p>
        ))}
        <p className="text-xs opacity-80">
          Scheduled syncs hold changes this large. Check the removals below; applying confirms them.
        </p>
      </div>
    </div>
  );
}
