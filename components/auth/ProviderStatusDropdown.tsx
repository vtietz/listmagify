'use client';

import { Check, ChevronDown, Disc3, Music2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PlayingIndicator } from '@/components/ui/playing-indicator';
import { cn } from '@/lib/utils';
import type { ProviderId } from '@/lib/providers/types';

type ProviderConnectionStatus = 'connected' | 'disconnected';

interface ProviderStatusDropdownProps {
  context: 'header' | 'panel';
  currentProviderId: ProviderId;
  providers: ProviderId[];
  statusMap: Record<ProviderId, ProviderConnectionStatus>;
  playingProviderInPanel?: ProviderId | null;
  onProviderChange: (providerId: ProviderId) => void;
  'data-testid'?: string;
}

function getProviderLabel(providerId: ProviderId): string {
  return providerId === 'spotify' ? 'Spotify' : 'TIDAL';
}

function ProviderGlyph({ providerId }: { providerId: ProviderId }) {
  if (providerId === 'spotify') {
    return <Music2 className="h-3.5 w-3.5" aria-hidden="true" />;
  }

  return <Disc3 className="h-3.5 w-3.5" aria-hidden="true" />;
}

function ProviderStatusIcon({
  status,
  showPlaying,
  dataTestId,
}: {
  status: ProviderConnectionStatus;
  showPlaying: boolean;
  dataTestId?: string;
}) {
  if (showPlaying) {
    return (
      <span data-testid={dataTestId}>
        <PlayingIndicator size="sm" className="ml-1" />
      </span>
    );
  }

  if (status === 'connected') {
    return (
      <Check
        className="h-3.5 w-3.5 text-green-500"
        aria-hidden="true"
        data-testid={dataTestId}
      />
    );
  }

  return (
    <Check
      className="h-3.5 w-3.5 text-muted-foreground"
      aria-hidden="true"
      data-testid={dataTestId}
    />
  );
}

function isPlayingProviderInPanel(
  context: 'header' | 'panel',
  providerId: ProviderId,
  playingProviderInPanel: ProviderId | null | undefined,
  status: ProviderConnectionStatus,
): boolean {
  return context === 'panel' && status === 'connected' && playingProviderInPanel === providerId;
}

export function ProviderStatusDropdown({
  context,
  currentProviderId,
  providers,
  statusMap,
  playingProviderInPanel = null,
  onProviderChange,
  'data-testid': dataTestId,
}: ProviderStatusDropdownProps) {
  const currentStatus = statusMap[currentProviderId] ?? 'disconnected';
  const currentIsPlaying = isPlayingProviderInPanel(context, currentProviderId, playingProviderInPanel, currentStatus);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 px-2',
            context === 'header' ? 'min-w-[132px] justify-between' : 'min-w-[124px] justify-between',
          )}
          data-testid={dataTestId}
          aria-label={`${getProviderLabel(currentProviderId)} provider status`}
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <ProviderGlyph providerId={currentProviderId} />
            <span>{getProviderLabel(currentProviderId)}</span>
            <ProviderStatusIcon
              status={currentStatus}
              showPlaying={currentIsPlaying}
              dataTestId={`${dataTestId ?? 'provider-status-dropdown'}-current-status`}
            />
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={context === 'header' ? 'end' : 'start'}
        className="w-52"
      >
        {providers.map((providerId) => {
          const status = statusMap[providerId] ?? 'disconnected';
          const isSelected = providerId === currentProviderId;
          const showPlaying = isPlayingProviderInPanel(context, providerId, playingProviderInPanel, status);

          return (
            <DropdownMenuItem
              key={providerId}
              disabled={context === 'header'}
              data-testid={`${dataTestId ?? 'provider-status-dropdown'}-${providerId}`}
              onSelect={() => {
                if (context === 'panel') {
                  onProviderChange(providerId);
                }
              }}
              className={cn('gap-2', isSelected && 'bg-accent/60')}
            >
              <ProviderGlyph providerId={providerId} />
              <span className="flex-1 text-sm">{getProviderLabel(providerId)}</span>
              <ProviderStatusIcon
                status={status}
                showPlaying={showPlaying}
                dataTestId={`${dataTestId ?? 'provider-status-dropdown'}-${providerId}-status`}
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}