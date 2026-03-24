'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import Image from 'next/image';
import { SignInButton } from '@/components/auth/SignInButton';
import { AccessRequestDialog } from '@/components/landing/AccessRequestDialog';
import { ByokDialog } from '@/components/landing/ByokDialog';
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
  Columns, 
  GripVertical, 
  Search, 
  ArrowUpDown, 
  Copy, 
  Trash2,
  Play,
  Minimize2,
  Sparkles,
  GitCompare,
  Smartphone,
  Music2,
  Github,
  MapPin,
  TextCursorInput,
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

      {/* Features Grid */}
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-2xl font-semibold text-center mb-12">
          Everything you need to master your playlists
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <FeatureCard
            icon={<Columns className="h-6 w-6" />}
            title="Multi-Panel Editor"
            description="Work with multiple playlists side-by-side. Split panels horizontally or vertically to compare and organize your music."
          />
          <FeatureCard
            icon={<GripVertical className="h-6 w-6" />}
            title="Drag & Drop"
            description="Effortlessly move tracks between playlists or reorder within a playlist. Copy or move mode with visual feedback."
          />
          <FeatureCard
            icon={<Copy className="h-6 w-6" />}
            title="Bulk Operations"
            description="Select multiple tracks and move, copy, or delete them at once. Perfect for large playlist reorganization."
          />
          <FeatureCard
            icon={<Search className="h-6 w-6" />}
            title="Smart Search"
            description="Instantly filter tracks by title, artist, or album. Find what you're looking for across thousands of tracks."
          />
          <FeatureCard
            icon={<GitCompare className="h-6 w-6" />}
            title="Compare Mode"
            description="Visualize track distribution across playlists with intelligent color coding. Green shows tracks in all playlists, red shows unique tracks, and yellow indicates partial presence."
          />
          <FeatureCard
            icon={<Smartphone className="h-6 w-6" />}
            title="Mobile Optimized"
            description="Fully responsive design with touch-friendly controls. Install as a PWA for native app experience on phones and tablets."
          />
          <FeatureCard
            icon={<Play className="h-6 w-6" />}
            title="Integrated Player"
            description="Preview any track instantly with the built-in Spotify player. No need to switch apps to check a song."
          />
          <FeatureCard
            icon={<Music2 className="h-6 w-6" />}
            title="Last.fm Import"
            description="Import tracks from your Last.fm listening history. Browse loved tracks, top tracks, and weekly charts with automatic Spotify matching."
          />
          <FeatureCard
            icon={<ArrowUpDown className="h-6 w-6" />}
            title="Flexible Sorting & Save Order"
            description="Sort by position, title, artist, album, duration, or date added. Save any sorted view permanently as the new playlist order."
          />
          <FeatureCard
            icon={<MapPin className="h-6 w-6" />}
            title="Insert at Markers"
            description="Mark multiple positions across playlists, then insert selected tracks at all marked locations simultaneously. Perfect for building DJ sets."
          />
          <FeatureCard
            icon={<Minimize2 className="h-6 w-6" />}
            title="Compact Mode"
            description="Toggle compact view to see more tracks at once. Perfect for large playlists and smaller screens."
          />
          <FeatureCard
            icon={<TextCursorInput className="h-6 w-6" />}
            title="Scroll Text"
            description="Auto-scroll overflowing track labels horizontally for better readability. Hover to pause and click artist or album links."
          />
          <FeatureCard
            icon={<Sparkles className="h-6 w-6" />}
            title="Smart Recommendations"
            description="Get AI-powered track suggestions based on your playlist patterns. The more you use it, the smarter it gets."
          />
          <FeatureCard
            icon={<Trash2 className="h-6 w-6" />}
            title="Safe Editing"
            description="Lock panels to prevent accidental changes. All edits sync directly with Spotify in real-time."
          />
        </div>
      </div>

      {/* Detailed Features with Screenshots */}
      <div className="container mx-auto px-4 py-16 border-t border-border">
        <h2 className="text-2xl font-semibold text-center mb-12">
          See it in action
        </h2>
        
        <div className="max-w-6xl mx-auto space-y-16">
          {/* Split Editor */}
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="order-2 md:order-1">
              <h3 className="text-xl font-semibold mb-3">Split Editor</h3>
              <p className="text-muted-foreground mb-4">
                Edit multiple playlists side-by-side with intuitive drag-and-drop. 
                Split panels horizontally or vertically to compare, organize, and 
                move tracks between playlists effortlessly. Lock panels to prevent 
                accidental changes and work with confidence.
              </p>
            </div>
            <div className="order-1 md:order-2 rounded-xl overflow-hidden border border-border shadow-lg">
              <Image
                src="/screenshot-split-editor.png"
                alt="Split Editor - Edit multiple playlists side by side with drag and drop"
                width={1920}
                height={1080}
                className="w-full h-auto"
                unoptimized
              />
            </div>
          </div>

          {/* Playlists View */}
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="rounded-xl overflow-hidden border border-border shadow-lg">
              <Image
                src="/screenshot-playlists.png"
                alt="Playlists - Browse and manage all your Spotify playlists"
                width={1920}
                height={1080}
                className="w-full h-auto"
                unoptimized
              />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-3">Playlists Management</h3>
              <p className="text-muted-foreground mb-4">
                Browse all your Spotify playlists in one organized view. Search, 
                filter, and quickly access any playlist to start editing. See 
                playlist details including track count, duration, and last modified 
                date at a glance.
              </p>
              <p className="text-sm text-muted-foreground/80 italic">
                Note: The Spotify API does not support playlist folders, so all playlists are displayed in a flat list.
              </p>
            </div>
          </div>

          {/* Compare Mode */}
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="order-2 md:order-1">
              <h3 className="text-xl font-semibold mb-3">Compare Mode</h3>
              <p className="text-muted-foreground mb-4">
                Visualize track distribution across multiple playlists with intelligent 
                color coding. Green highlights tracks present in all playlists, red shows 
                unique tracks, and yellow indicates partial presence. Perfect for finding 
                duplicates or discovering which tracks to share between collections.
              </p>
            </div>
            <div className="order-1 md:order-2 rounded-xl overflow-hidden border border-border shadow-lg">
              <Image
                src="/screenshot-compare-mode.png"
                alt="Compare Mode - Visualize track distribution across playlists"
                width={1920}
                height={1080}
                className="w-full h-auto"
                unoptimized
              />
            </div>
          </div>

          {/* Mobile Experience */}
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-3">Mobile Experience</h3>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Fully responsive design optimized for phones and tablets. Edit playlists 
                on the go with touch-friendly controls. Install as a Progressive Web App 
                for a native app experience with offline support.
              </p>
            </div>
            <div className="flex flex-col md:flex-row justify-center items-center md:items-start gap-6 max-w-5xl mx-auto">
              <div className="rounded-xl overflow-hidden border border-border shadow-lg w-full max-w-[280px]">
                <Image
                  src="/screenshot-mobile-portrait.png"
                  alt="Mobile Portrait - Touch-optimized interface for phones"
                  width={1080}
                  height={1920}
                  className="w-full h-auto"
                  unoptimized
                />
              </div>
              <div className="rounded-xl overflow-hidden border border-border shadow-lg w-full max-w-[500px]">
                <Image
                  src="/screenshot-mobile-landscape.png"
                  alt="Mobile Landscape - Optimized layout for tablets"
                  width={1920}
                  height={1080}
                  className="w-full h-auto"
                  unoptimized
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Use Cases Section */}
      <div className="container mx-auto px-4 py-16 border-t border-border">
        <h2 className="text-2xl font-semibold text-center mb-12">
          Perfect for every playlist workflow
        </h2>
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <UseCaseCard
            title="🎧 DJs & Party Planners"
            description="Organize setlists by genre, energy level, or event. Quickly move tracks between themed playlists and preview songs before your gig."
          />
          <UseCaseCard
            title="🎵 Music Curators"
            description="Maintain multiple genre playlists efficiently. Deduplicate, reorganize, and keep your collections fresh with bulk operations."
          />
          <UseCaseCard
            title="🏃 Fitness Enthusiasts"
            description="Build the perfect workout playlists. Organize high-energy tracks, copy favorites between sessions, and keep your motivation music ready to go."
          />
          <UseCaseCard
            title="📚 Mood & Activity Playlists"
            description="Create playlists for work, study, relaxation, or travel. Drag tracks from your Liked Songs into themed collections."
          />
        </div>
      </div>

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

      {/* Open Source Section */}
      <div className="container mx-auto px-4 py-12 border-t border-border">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center justify-center gap-2 text-muted-foreground">
            <Github className="h-5 w-5" />
            <span className="text-sm font-medium">Open Source Project</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Listmagify is free and open source. Check out the code, report issues, or contribute on GitHub.
          </p>
          <a
            href="https://github.com/vtietz/listmagify"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <Github className="h-4 w-4" />
            View on GitHub
          </a>
        </div>

      </div>
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors">
      <div className="flex items-start gap-4">
        <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function UseCaseCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 rounded-lg border border-border bg-card/50">
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
