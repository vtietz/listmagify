'use client';

import { useState } from 'react';
import { Check, ChevronDown, LogIn } from 'lucide-react';
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
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/spotify/Spotify_Primary_Logo_RGB_White.png"
          alt=""
          aria-hidden="true"
          className="h-4 w-4 shrink-0 hidden dark:block"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/spotify/Spotify_Primary_Logo_RGB_Black.png"
          alt=""
          aria-hidden="true"
          className="h-4 w-4 shrink-0 dark:hidden"
        />
      </>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/tidal/Tidal_(service)_logo_only_white.svg"
        alt=""
        aria-hidden="true"
        className="h-4 w-4 shrink-0 hidden dark:block"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/tidal/Tidal_(service)_logo_only.svg"
        alt=""
        aria-hidden="true"
        className="h-4 w-4 shrink-0 dark:hidden"
      />
    </>
  );
}

function HeaderConnectedProvidersIndicator({
  providers,
  statusMap,
  dataTestId,
}: {
  providers: ProviderId[];
  statusMap: Record<ProviderId, ProviderConnectionStatus>;
  dataTestId?: string;
}) {
  const connectedProviders = providers.filter((providerId) => (statusMap[providerId] ?? 'disconnected') === 'connected');

  if (connectedProviders.length === 0) {
    return (
      <span className="inline-flex items-center justify-center" data-testid={`${dataTestId ?? 'provider-status-dropdown'}-header-connect`}>
        <LogIn className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1" data-testid={`${dataTestId ?? 'provider-status-dropdown'}-header-connected`}>
      {connectedProviders.map((providerId) => (
        <span key={providerId} className="inline-flex items-center justify-center">
          <ProviderGlyph providerId={providerId} />
        </span>
      ))}
    </span>
  );
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
  const [open, setOpen] = useState(false);
  const isPanelContext = context === 'panel';
  const isSingleProvider = providers.length <= 1;

  // Single provider: nothing to switch — hide entirely
  if (isSingleProvider) {
    return null;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isPanelContext ? 'ghost' : 'outline'}
          size={isPanelContext ? 'icon' : 'sm'}
          className={cn(
            isPanelContext
              ? 'h-7 w-7 p-0 border-0 shadow-none hover:bg-muted/50 ml-1'
              : 'h-9 gap-1.5 px-2 min-w-[88px] justify-between',
          )}
          data-testid={dataTestId}
          aria-label={isPanelContext ? `${getProviderLabel(currentProviderId)} provider` : 'Connected providers'}
        >
          {isPanelContext ? (
            <ProviderGlyph providerId={currentProviderId} />
          ) : (
            <>
              <HeaderConnectedProvidersIndicator
                providers={providers}
                statusMap={statusMap}
                {...(dataTestId ? { dataTestId } : {})}
              />
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </>
          )}
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
              data-testid={`${dataTestId ?? 'provider-status-dropdown'}-${providerId}`}
              onSelect={() => {
                if (providerId !== currentProviderId) {
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