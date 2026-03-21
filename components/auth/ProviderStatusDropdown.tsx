'use client';

import { useState } from 'react';
import { Check, ChevronDown, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  onProviderLogout,
  'data-testid': dataTestId,
}: ProviderStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [logoutProviderId, setLogoutProviderId] = useState<ProviderId | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const currentStatus = statusMap[currentProviderId] ?? 'disconnected';
  const currentIsPlaying = isPlayingProviderInPanel(context, currentProviderId, playingProviderInPanel, currentStatus);

  const logoutProviderLabel = logoutProviderId ? getProviderLabel(logoutProviderId) : null;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
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
                data-testid={`${dataTestId ?? 'provider-status-dropdown'}-${providerId}`}
                onSelect={() => {
                  onProviderChange(providerId);
                  setOpen(false);
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

          {context === 'header' && onProviderLogout && (
            <>
              <DropdownMenuSeparator />
              {providers.map((providerId) => {
                const status = statusMap[providerId] ?? 'disconnected';
                const disabled = status !== 'connected' || isLoggingOut;
                return (
                  <DropdownMenuItem
                    key={`logout-${providerId}`}
                    disabled={disabled}
                    data-testid={`${dataTestId ?? 'provider-status-dropdown'}-logout-${providerId}`}
                    onSelect={() => {
                      if (!disabled) {
                        setLogoutProviderId(providerId);
                      }
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="flex-1 text-sm">Logout {getProviderLabel(providerId)}</span>
                  </DropdownMenuItem>
                );
              })}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={logoutProviderId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isLoggingOut) {
            setLogoutProviderId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Logout {logoutProviderLabel ?? 'provider'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This disconnects your {logoutProviderLabel ?? 'selected provider'} account for this session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoggingOut}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isLoggingOut || !logoutProviderId || !onProviderLogout}
              onClick={async (event) => {
                if (!logoutProviderId || !onProviderLogout) {
                  return;
                }

                event.preventDefault();
                setIsLoggingOut(true);
                try {
                  await onProviderLogout(logoutProviderId);
                  setLogoutProviderId(null);
                } finally {
                  setIsLoggingOut(false);
                }
              }}
            >
              {isLoggingOut ? 'Logging out…' : 'Logout'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}