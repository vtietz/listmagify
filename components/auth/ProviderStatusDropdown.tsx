'use client';

import { useState } from 'react';
import { Check, ChevronDown, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PlayingIndicator } from '@/components/ui/playing-indicator';
import { cn } from '@/lib/utils';
import { isProviderId, type ProviderId } from '@/lib/providers/types';

type ProviderConnectionStatus = 'connected' | 'disconnected';

interface ProviderStatusDropdownProps {
  context: 'header' | 'panel';
  currentProviderId: ProviderId;
  providers: ProviderId[];
  statusMap: Record<ProviderId, ProviderConnectionStatus>;
  hideWhenSingleConnected?: boolean;
  playingProviderInPanel?: ProviderId | null;
  onProviderChange: (providerId: ProviderId) => void;
  onProviderLogout?: (providerId: ProviderId) => Promise<void> | void;
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

function getTriggerClassName(context: 'header' | 'panel', isSingleConnectedInHeader: boolean): string {
  if (context === 'panel') {
    return 'h-7 w-7 p-0 border-0 shadow-none hover:bg-muted/50 ml-1';
  }

  if (isSingleConnectedInHeader) {
    return 'h-9 gap-1.5 px-2';
  }

  return 'h-9 gap-1.5 px-2 min-w-[88px] justify-between';
}

function getTriggerAriaLabel(context: 'header' | 'panel', currentProviderId: ProviderId): string {
  return context === 'panel' ? `${getProviderLabel(currentProviderId)} provider` : 'Connected providers';
}

function getDropdownAlign(context: 'header' | 'panel'): 'start' | 'end' {
  return context === 'header' ? 'end' : 'start';
}

function handleProviderValueChange({
  value,
  currentProviderId,
  onProviderChange,
  setOpen,
}: {
  value: string;
  currentProviderId: ProviderId;
  onProviderChange: (providerId: ProviderId) => void;
  setOpen: (open: boolean) => void;
}): void {
  if (!isProviderId(value)) {
    return;
  }

  if (value !== currentProviderId) {
    setOpen(false);
    onProviderChange(value);
  }
}

function ProviderOptionsGroup({
  context,
  currentProviderId,
  providers,
  statusMap,
  playingProviderInPanel,
  onProviderChange,
  setOpen,
  dataTestId,
}: {
  context: 'header' | 'panel';
  currentProviderId: ProviderId;
  providers: ProviderId[];
  statusMap: Record<ProviderId, ProviderConnectionStatus>;
  playingProviderInPanel: ProviderId | null;
  onProviderChange: (providerId: ProviderId) => void;
  setOpen: (open: boolean) => void;
  dataTestId: string | undefined;
}) {
  return (
    <DropdownMenuRadioGroup
      value={currentProviderId}
      onValueChange={(value) => {
        handleProviderValueChange({ value, currentProviderId, onProviderChange, setOpen });
      }}
    >
      {providers.map((providerId) => {
        const status = statusMap[providerId] ?? 'disconnected';
        const isSelected = providerId === currentProviderId;
        const showPlaying = isPlayingProviderInPanel(context, providerId, playingProviderInPanel, status);

        return (
          <DropdownMenuRadioItem
            key={providerId}
            value={providerId}
            data-testid={`${dataTestId ?? 'provider-status-dropdown'}-${providerId}`}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
            className={cn('gap-2 pl-2', isSelected && 'bg-accent/60')}
          >
            <ProviderGlyph providerId={providerId} />
            <span className="flex-1 text-sm">{getProviderLabel(providerId)}</span>
            <ProviderStatusIcon
              status={status}
              showPlaying={showPlaying}
              dataTestId={`${dataTestId ?? 'provider-status-dropdown'}-${providerId}-status`}
            />
          </DropdownMenuRadioItem>
        );
      })}
    </DropdownMenuRadioGroup>
  );
}

function HeaderProviderLogoutItems({
  context,
  connectedProviders,
  onProviderLogout,
  loggingOutProviderId,
  setLoggingOutProviderId,
  setOpen,
  dataTestId,
}: {
  context: 'header' | 'panel';
  connectedProviders: ProviderId[];
  onProviderLogout: ((providerId: ProviderId) => Promise<void> | void) | undefined;
  loggingOutProviderId: ProviderId | null;
  setLoggingOutProviderId: (providerId: ProviderId | null | ((current: ProviderId | null) => ProviderId | null)) => void;
  setOpen: (open: boolean) => void;
  dataTestId: string | undefined;
}) {
  if (context !== 'header' || !onProviderLogout || connectedProviders.length === 0) {
    return null;
  }

  return (
    <>
      <DropdownMenuSeparator />
      {connectedProviders.map((providerId) => {
        const isLoggingOut = loggingOutProviderId === providerId;

        return (
          <DropdownMenuItem
            key={`logout-${providerId}`}
            disabled={loggingOutProviderId !== null}
            data-testid={`${dataTestId ?? 'provider-status-dropdown'}-logout-${providerId}`}
            onSelect={() => {
              setOpen(false);
              setLoggingOutProviderId(providerId);
              void Promise.resolve(onProviderLogout(providerId)).finally(() => {
                setLoggingOutProviderId((current) => (current === providerId ? null : current));
              });
            }}
            className="gap-2"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="flex-1 text-sm">{isLoggingOut ? `Logging out ${getProviderLabel(providerId)}…` : `Logout ${getProviderLabel(providerId)}`}</span>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

export function ProviderStatusDropdown({
  context,
  currentProviderId,
  providers,
  statusMap,
  hideWhenSingleConnected = false,
  playingProviderInPanel = null,
  onProviderChange,
  onProviderLogout,
  'data-testid': dataTestId,
}: ProviderStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [loggingOutProviderId, setLoggingOutProviderId] = useState<ProviderId | null>(null);
  const isSingleProvider = providers.length <= 1;
  const connectedProviders = providers.filter((providerId) => (statusMap[providerId] ?? 'disconnected') === 'connected');
  const isSingleConnectedProvider = connectedProviders.length <= 1;
  const isSingleConnectedInHeader = context === 'header' && connectedProviders.length <= 1;

  // Single provider: nothing to switch — hide entirely
  if (isSingleProvider) {
    return null;
  }

  if (hideWhenSingleConnected && isSingleConnectedProvider) {
    return null;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={context === 'panel' ? 'ghost' : 'outline'}
          size={context === 'panel' ? 'icon' : 'sm'}
          className={getTriggerClassName(context, isSingleConnectedInHeader)}
          data-testid={dataTestId}
          aria-label={getTriggerAriaLabel(context, currentProviderId)}
        >
          {context === 'panel' ? (
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
        align={getDropdownAlign(context)}
        className="w-52"
      >
        <ProviderOptionsGroup
          context={context}
          currentProviderId={currentProviderId}
          providers={providers}
          statusMap={statusMap}
          playingProviderInPanel={playingProviderInPanel}
          onProviderChange={onProviderChange}
          setOpen={setOpen}
          dataTestId={dataTestId}
        />

        <HeaderProviderLogoutItems
          context={context}
          connectedProviders={connectedProviders}
          onProviderLogout={onProviderLogout}
          loggingOutProviderId={loggingOutProviderId}
          setLoggingOutProviderId={setLoggingOutProviderId}
          setOpen={setOpen}
          dataTestId={dataTestId}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}