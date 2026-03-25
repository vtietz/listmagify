'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import Image from 'next/image';
import { SignInButton } from '@/components/auth/SignInButton';
import { AccessRequestDialog } from '@/components/landing/AccessRequestDialog';
import { ByokDialog } from '@/components/landing/ByokDialog';
import {
  LandingDetailedFeaturesSection,
  LandingFeaturesGridSection,
  LandingOpenSourceSection,
  LandingUseCasesSection,
} from '@/components/landing/LandingPageSections';
import { AuthMessage } from '@/components/auth/AuthMessage';
import { DevModeNotice } from '@/components/auth/DevModeNotice';
import { UnapprovedUserDialog } from '@/components/auth/UnapprovedUserDialog';
import { AppLogo } from '@/components/ui/app-logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useByokCredentials } from '@/hooks/useByokCredentials';
import { useAuthSummary } from '@/hooks/auth/useAuth';
import { syncProviderAuthStatusWithRetry } from '@/lib/providers/syncProviderAuth';
import type { MusicProviderId } from '@/lib/music-provider/types';
import {
  Check,
  CheckCircle,
  ChevronDown,
  Key,
  UserPlus,
  LogOut,
} from 'lucide-react';

interface LandingPageContentProps {
  isAuthenticated: boolean;
  showMessage: boolean;
  message: string | null;
  returnTo: string;
  oauthError?: string | undefined;
  oauthProvider?: MusicProviderId | undefined;
  isAccessRequestEnabled: boolean;
}

type ProviderStatusMap = Record<MusicProviderId, 'connected' | 'disconnected'>;

function getConnectedProviderIds(
  providers: MusicProviderId[],
  statusMap: ProviderStatusMap,
): MusicProviderId[] {
  return providers.filter((provider) => statusMap[provider] === 'connected');
}

function appendProviderToPath(path: string, providerId: MusicProviderId): string {
  const [rawPath, rawQuery] = path.split('?');
  const pathname = rawPath ?? path;
  const params = new URLSearchParams(rawQuery ?? '');
  params.set('provider', providerId);
  const query = params.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

function getProviderLabel(provider: MusicProviderId): string {
  return provider === 'spotify' ? 'Spotify' : 'TIDAL';
}

function ProviderAuthButton({
  provider,
  status,
  returnTo,
  isAccessRequestEnabled,
  hasCredentials,
  onLogout,
}: {
  provider: MusicProviderId;
  status: 'connected' | 'disconnected';
  returnTo: string;
  isAccessRequestEnabled: boolean;
  hasCredentials: boolean;
  onLogout: (provider: MusicProviderId) => void;
}) {
  const isConnected = status === 'connected';
  const providerLabel = getProviderLabel(provider);

  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden bg-background">
      {isConnected ? (
        <button
          type="button"
          disabled
          className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-foreground bg-background"
        >
          <Check className="h-4 w-4 text-green-500" />
          Connected with {providerLabel}
        </button>
      ) : (
        <SignInButton
          callbackUrl={returnTo}
          providerId={provider}
          label={provider === 'spotify' ? 'Sign in with Spotify' : 'Sign in with TIDAL'}
          className="rounded-none border-0 px-5 py-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        />
      )}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center justify-center border-l px-3 ${
              isConnected
                ? 'border-border text-foreground hover:bg-accent'
                : 'border-primary/70 bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
            aria-label={`${providerLabel} actions`}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-56 p-1.5">
          {isConnected ? (
            <button
              type="button"
              onClick={() => onLogout(provider)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          ) : (
            <div className="space-y-1">
              {provider === 'spotify' && isAccessRequestEnabled && !hasCredentials && (
                <AccessRequestDialog
                  trigger={(
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Request Access
                    </button>
                  )}
                />
              )}

              {provider === 'spotify' ? (
                <ByokDialog
                  trigger={(
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      {hasCredentials ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Key className="h-3.5 w-3.5" />
                      )}
                      Use Your Own API Key
                    </button>
                  )}
                />
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground opacity-70"
                >
                  <Key className="h-3.5 w-3.5" />
                  Use Your Own API Key (coming soon)
                </button>
              )}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function LandingAuthActions({
  isAuthenticated,
  availableProviders,
  providerStatusMap,
  returnTo,
  onOpenApp,
  isAccessRequestEnabled,
  hasCredentials,
  onProviderLogout,
}: {
  isAuthenticated: boolean;
  availableProviders: MusicProviderId[];
  providerStatusMap: ProviderStatusMap;
  returnTo: string;
  onOpenApp: () => void;
  isAccessRequestEnabled: boolean;
  hasCredentials: boolean;
  onProviderLogout: (provider: MusicProviderId) => void;
}) {
  return (
    <>
      {isAuthenticated && (
        <button
          onClick={onOpenApp}
          className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Open App
        </button>
      )}
      {availableProviders.map((provider) => (
        <ProviderAuthButton
          key={provider}
          provider={provider}
          status={providerStatusMap[provider]}
          returnTo={returnTo}
          isAccessRequestEnabled={isAccessRequestEnabled}
          hasCredentials={hasCredentials}
          onLogout={onProviderLogout}
        />
      ))}
    </>
  );
}

export function LandingPageContent({
  isAuthenticated,
  showMessage,
  message,
  returnTo,
  oauthError,
  oauthProvider,
  isAccessRequestEnabled,
}: LandingPageContentProps) {
  const router = useRouter();
  const panels = useSplitGridStore((state) => state.panels);
  const [byokEnabled, setByokEnabled] = useState<boolean | null>(null);
  const [availableProviders, setAvailableProviders] = useState<MusicProviderId[]>(['spotify']);
  const { hasCredentials } = useByokCredentials();
  const { update } = useSession();
  const authSummary = useAuthSummary();
  const isE2EMode = process.env.NEXT_PUBLIC_E2E_MODE === '1';

  const providerStatusMap: ProviderStatusMap = {
    spotify: authSummary.spotify.code === 'ok' ? 'connected' : 'disconnected',
    tidal: authSummary.tidal.code === 'ok' ? 'connected' : 'disconnected',
  };

  const handleProviderLogout = (provider: MusicProviderId) => {
    void (async () => {
      if (providerStatusMap[provider] !== 'connected') {
        return;
      }

      if (isE2EMode) {
        await fetch(`/api/test/logout?provider=${provider}`, {
          method: 'GET',
          cache: 'no-store',
        });
        await syncProviderAuthStatusWithRetry();
        return;
      }

      if (typeof update === 'function') {
        await update({ providerAuthAction: 'logout-provider', providerId: provider });
      }

      await syncProviderAuthStatusWithRetry();
    })();
  };

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((json: { byokEnabled?: boolean; availableProviders?: MusicProviderId[] }) => {
        setByokEnabled(json.byokEnabled ?? false);
        const providers = json.availableProviders;
        if (Array.isArray(providers) && providers.length > 0) {
          setAvailableProviders(providers);
        }
      })
      .catch(() => setByokEnabled(false));
  }, []);

  // Log OAuth error (failed login attempt) when detected
  useEffect(() => {
    if (oauthError) {
      fetch('/api/auth/log-failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: oauthError }),
      }).catch(() => {
        // Silently ignore logging errors
      });
    }
  }, [oauthError]);

  // Smart redirect for authenticated users clicking "Get Started"
  const handleGetStarted = () => {
    const connectedProviderIds = getConnectedProviderIds(availableProviders, providerStatusMap);
    const preferredProvider = connectedProviderIds.length > 0 ? connectedProviderIds[0] : null;
    // Check if user has panels configured (has used split editor before)
    const hasPanelsConfigured = panels.length > 0 && panels.some(p => p.playlistId);
    
    if (hasPanelsConfigured) {
      router.push(preferredProvider ? appendProviderToPath('/split-editor', preferredProvider) : '/split-editor');
    } else {
      router.push(preferredProvider ? appendProviderToPath('/playlists', preferredProvider) : '/playlists');
    }
  };

  return (
    <main className="flex-1 bg-gradient-to-b from-background to-background/95">
      {/* Hero Section */}
      <div className="container mx-auto px-4 pt-16 pb-12">
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          <div className="flex justify-center">
            <AppLogo size="lg" asLink={false} />
          </div>
          
          {/* Show message if present (session expired, unauthenticated, etc.) */}
          {showMessage && message && (
            <div className="max-w-xl mx-auto">
              <AuthMessage>{message}</AuthMessage>
            </div>
          )}
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Professional playlist management for Spotify and TIDAL. Edit multiple playlists side-by-side with drag-and-drop.
          </p>
          <p className="text-sm text-muted-foreground">
            Open source • Free to use • Your data stays with your music provider
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <LandingAuthActions
              isAuthenticated={isAuthenticated}
              availableProviders={availableProviders}
              providerStatusMap={providerStatusMap}
              returnTo={returnTo}
              onOpenApp={handleGetStarted}
              isAccessRequestEnabled={isAccessRequestEnabled}
              hasCredentials={hasCredentials}
              onProviderLogout={handleProviderLogout}
            />
          </div>
          
          {/* Development Mode Notice - only show when not authenticated */}
          {!isAuthenticated && (
            <div className="mt-6 max-w-xl mx-auto">
              <DevModeNotice
                showRequestAccessHint={isAccessRequestEnabled}
                showByokHint={byokEnabled === true}
              />
            </div>
          )}
        </div>
      </div>

      {/* Unapproved User Dialog - shows when OAuth returns access_denied error */}
      <UnapprovedUserDialog
        error={oauthError}
        providerId={oauthProvider}
        showRequestAccess={isAccessRequestEnabled}
      />

      {/* Main Screenshot */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="rounded-xl overflow-hidden border border-border shadow-2xl">
            <Image
              src="/screenshot-split-editor.png"
              alt="Split Editor - Edit multiple playlists side by side with drag and drop"
              width={1920}
              height={1080}
              className="w-full h-auto"
              priority
              unoptimized
            />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Edit multiple playlists simultaneously with the split panel editor
          </p>
        </div>
      </div>

      <LandingFeaturesGridSection />
      <LandingDetailedFeaturesSection />
      <LandingUseCasesSection />

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-16 border-t border-border">
        <div className="text-center space-y-6 max-w-2xl mx-auto">
          <h2 className="text-2xl font-semibold">
            Ready to take control of your playlists?
          </h2>
          <p className="text-muted-foreground">
            {isAuthenticated 
              ? "Jump back into the editor and continue organizing your music."
              : "Sign in with Spotify to start organizing your music. No account creation needed – just connect and go."
            }
          </p>
          {isAuthenticated ? (
            <button
              onClick={handleGetStarted}
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Open App
            </button>
          ) : (
            <SignInButton callbackUrl="/split-editor" />
          )}
        </div>
      </div>

      <LandingOpenSourceSection />
    </main>
  );
}
