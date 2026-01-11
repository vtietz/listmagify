'use client';

import { useRouter } from 'next/navigation';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import Image from 'next/image';
import { SignInButton } from '@/components/auth/SignInButton';
import { AccessRequestDialog } from '@/components/landing/AccessRequestDialog';
import { ByokSignInButton } from '@/components/landing/ByokSignInButton';
import { AuthMessage } from '@/components/auth/AuthMessage';
import { DevModeNotice } from '@/components/auth/DevModeNotice';
import { AppLogo } from '@/components/ui/app-logo';
import { 
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
  Github
} from 'lucide-react';

interface LandingPageContentProps {
  isAuthenticated: boolean;
  showMessage: boolean;
  message: string | null;
  returnTo: string;
}

export function LandingPageContent({
  isAuthenticated,
  showMessage,
  message,
  returnTo,
}: LandingPageContentProps) {
  const router = useRouter();
  const panels = useSplitGridStore((state) => state.panels);

  const isAccessRequestEnabled =
    process.env.NEXT_PUBLIC_ACCESS_REQUEST_ENABLED === 'true';

  // Smart redirect for authenticated users clicking "Get Started"
  const handleGetStarted = () => {
    // Check if user has panels configured (has used split editor before)
    const hasPanelsConfigured = panels.length > 0 && panels.some(p => p.playlistId);
    
    if (hasPanelsConfigured) {
      router.push('/split-editor');
    } else {
      router.push('/playlists');
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
            Professional playlist management for Spotify. Edit multiple playlists side-by-side with drag-and-drop.
          </p>
          <p className="text-sm text-muted-foreground">
            Open source • Free to use • Your data stays with Spotify
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            {isAuthenticated ? (
              <button
                onClick={handleGetStarted}
                className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Open App
              </button>
            ) : (
              <>
                <SignInButton callbackUrl={returnTo} label="Sign in with Spotify" />
                {isAccessRequestEnabled && (
                  <AccessRequestDialog
                    trigger={
                      <button className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-6 py-3 text-sm font-medium hover:bg-accent transition-colors">
                        Request Access
                      </button>
                    }
                  />
                )}
                <ByokSignInButton callbackUrl={returnTo} />
              </>
            )}
          </div>
          
          {/* Development Mode Notice - only show when not authenticated */}
          {!isAuthenticated && (
            <div className="mt-6 max-w-xl mx-auto">
              <DevModeNotice showRequestAccessHint={isAccessRequestEnabled} />
            </div>
          )}
        </div>
      </div>

      {/* Screenshot Showcase */}
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
            title="Flexible Sorting"
            description="Sort by position, title, artist, album, duration, or date added. Ascending or descending with one click."
          />
          <FeatureCard
            icon={<Minimize2 className="h-6 w-6" />}
            title="Compact Mode"
            description="Toggle compact view to see more tracks at once. Perfect for large playlists and smaller screens."
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
