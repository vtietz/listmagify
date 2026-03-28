'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { PlaylistSelector } from '@/components/split-editor/playlist/PlaylistSelector';
import { ProviderStatusDropdown } from '@/components/auth/ProviderStatusDropdown';
import { useAvailableProviders } from '@shared/hooks/useAvailableProviders';
import { useAuthSummary } from '@features/auth/hooks/useAuth';
import { useCreateSyncPair } from '@features/sync/hooks/useSyncPairs';
import { Plus, ArrowLeftRight } from 'lucide-react';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncPair } from '@/lib/sync/types';

/** Same grid as SyncPairRow: [left] [↔] [right] [_status_] [actions] */
const ROW_GRID = 'grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-x-2';

export function AddSyncPairForm() {
  const allProviders = useAvailableProviders();
  const authSummary = useAuthSummary();
  const createPair = useCreateSyncPair();

  const statusMap = useMemo(() => ({
    spotify: authSummary.spotify.code === 'ok' ? 'connected' : 'disconnected',
    tidal: authSummary.tidal.code === 'ok' ? 'connected' : 'disconnected',
  } satisfies Record<MusicProviderId, 'connected' | 'disconnected'>), [authSummary]);

  const connectedProviders = useMemo(
    () => allProviders.filter((p) => statusMap[p] === 'connected'),
    [allProviders, statusMap],
  );

  const defaultProvider = connectedProviders[0] ?? 'spotify';

  const [sourceProvider, setSourceProvider] = useState<MusicProviderId>(defaultProvider);
  const [sourcePlaylistId, setSourcePlaylistId] = useState<string | null>(null);
  const [targetProvider, setTargetProvider] = useState<MusicProviderId>(defaultProvider);
  const [targetPlaylistId, setTargetPlaylistId] = useState<string | null>(null);

  const canSubmit = sourcePlaylistId && targetPlaylistId && !createPair.isPending;

  function handleSubmit() {
    if (!sourcePlaylistId || !targetPlaylistId) return;

    createPair.mutate(
      {
        sourceProvider,
        sourcePlaylistId,
        targetProvider,
        targetPlaylistId,
        direction: 'bidirectional',
      },
      {
        onSuccess: (_pair: SyncPair) => {
          setSourcePlaylistId(null);
          setTargetPlaylistId(null);
        },
      },
    );
  }

  if (connectedProviders.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-2">
        Log in to a provider to create sync pairs.
      </p>
    );
  }

  return (
    <div className={`${ROW_GRID} px-3 py-2`}>
      {/* Left: provider + playlist */}
      <div className="flex items-center gap-1.5 min-w-0">
        <ProviderStatusDropdown
          context="panel"
          currentProviderId={sourceProvider}
          providers={connectedProviders}
          statusMap={statusMap}
          hideWhenSingleConnected={false}
          onProviderChange={(id) => { setSourceProvider(id); setSourcePlaylistId(null); }}
        />
        <div className="flex-1 min-w-0">
          <PlaylistSelector
            providerId={sourceProvider}
            selectedPlaylistId={sourcePlaylistId}
            selectedPlaylistName=""
            onSelectPlaylist={(id) => setSourcePlaylistId(id)}
            disabled={statusMap[sourceProvider] !== 'connected'}
          />
        </div>
      </div>

      {/* Arrow */}
      <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      {/* Right: provider + playlist */}
      <div className="flex items-center gap-1.5 min-w-0">
        <ProviderStatusDropdown
          context="panel"
          currentProviderId={targetProvider}
          providers={connectedProviders}
          statusMap={statusMap}
          hideWhenSingleConnected={false}
          onProviderChange={(id) => { setTargetProvider(id); setTargetPlaylistId(null); }}
        />
        <div className="flex-1 min-w-0">
          <PlaylistSelector
            providerId={targetProvider}
            selectedPlaylistId={targetPlaylistId}
            selectedPlaylistName=""
            onSelectPlaylist={(id) => setTargetPlaylistId(id)}
            disabled={statusMap[targetProvider] !== 'connected'}
          />
        </div>
      </div>

      {/* Status column — empty for the add row */}
      <div />

      {/* Add button — aligned with the actions column */}
      <Button size="sm" disabled={!canSubmit} onClick={handleSubmit} className="shrink-0">
        <Plus className="h-4 w-4 mr-1" />
        {createPair.isPending ? 'Adding...' : 'Add'}
      </Button>
    </div>
  );
}
