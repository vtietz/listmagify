import Image from 'next/image';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { formatProviderNames } from '@/lib/music-provider/providerLabels';
import {
  ArrowUpDown,
  Columns,
  Copy,
  Github,
  GitCompare,
  GripVertical,
  Import,
  MapPin,
  Minimize2,
  Music2,
  Play,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  TextCursorInput,
  Trash2,
} from 'lucide-react';

export function LandingFeaturesGridSection({ availableProviders }: { availableProviders: MusicProviderId[] }) {
  const providerNames = formatProviderNames(availableProviders);
  const isMultiProvider = availableProviders.length > 1;
  return (
    <div className="container mx-auto px-4 py-16">
      <h2 className="text-2xl font-semibold text-center mb-12">
        Everything you need to master your playlists
      </h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        <FeatureCard
          icon={<Columns className="h-6 w-6" />}
          title="Multi-Panel Editor"
          description={`Work with multiple playlists side-by-side${isMultiProvider ? ', even across providers' : ''}. Split panels horizontally or vertically to compare and organize your music.`}
        />
        <FeatureCard
          icon={<GripVertical className="h-6 w-6" />}
          title="Drag & Drop"
          description={`Effortlessly move tracks between playlists or reorder within a playlist.${isMultiProvider ? ` Drag across ${providerNames} with automatic track matching.` : ''} Copy or move mode with visual feedback.`}
        />
        {isMultiProvider && (
          <FeatureCard
            icon={<Import className="h-6 w-6" />}
            title="Import & Transfer"
            description={`Bulk-import playlists from one provider to another. Select playlists, resolve tracks automatically via ISRC and search matching, and transfer your library across ${providerNames} with a single click.`}
          />
        )}
        {isMultiProvider && (
          <FeatureCard
            icon={<RefreshCw className="h-6 w-6" />}
            title="Cross-Provider Sync"
            description={`Keep playlists in sync across ${providerNames}. One-way or bidirectional sync with intelligent track matching, preview changes before applying, and enable auto-sync to stay up to date.`}
          />
        )}
        <FeatureCard
          icon={<Copy className="h-6 w-6" />}
          title="Bulk Operations"
          description="Select multiple tracks and move, copy, or delete them at once. Perfect for large playlist reorganization."
        />
        <FeatureCard
          icon={<GitCompare className="h-6 w-6" />}
          title="Compare Mode"
          description="Visualize track distribution across playlists with intelligent color coding. Green shows tracks in all playlists, red shows unique tracks, and yellow indicates partial presence."
        />
        <FeatureCard
          icon={<Search className="h-6 w-6" />}
          title="Browse & Search"
          description={`Search the ${providerNames} catalog directly from the editor. Browse by artist or album, filter tracks within any playlist, and drag results straight into your playlists.`}
        />
        <FeatureCard
          icon={<ArrowUpDown className="h-6 w-6" />}
          title="Flexible Sorting & Save Order"
          description="Sort by position, title, artist, album, duration, or date added. Save any sorted view permanently as the new playlist order."
        />
        <FeatureCard
          icon={<Play className="h-6 w-6" />}
          title="Integrated Player"
          description="Preview any track instantly with the built-in Spotify player. No need to switch apps to check a song. Currently available for Spotify only."
        />
        <FeatureCard
          icon={<MapPin className="h-6 w-6" />}
          title="Insert at Markers"
          description="Mark multiple positions across playlists, then insert selected tracks at all marked locations simultaneously. Perfect for building DJ sets."
        />
        <FeatureCard
          icon={<Music2 className="h-6 w-6" />}
          title="Last.fm Import"
          description={`Import tracks from your Last.fm listening history. Browse loved tracks, top tracks, and weekly charts with automatic ${providerNames} matching.`}
        />
        <FeatureCard
          icon={<Sparkles className="h-6 w-6" />}
          title="Smart Recommendations"
          description="Get track suggestions based on your playlist patterns. Discover new music that fits the vibe of your existing collections."
        />
        <FeatureCard
          icon={<Trash2 className="h-6 w-6" />}
          title="Safe Editing"
          description={`Lock panels to prevent accidental changes. All edits sync directly with ${providerNames} in real-time.`}
        />
        <FeatureCard
          icon={<Smartphone className="h-6 w-6" />}
          title="Mobile Optimized"
          description="Fully responsive design with touch-friendly controls. Install as a PWA for native app experience on phones and tablets."
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
      </div>
    </div>
  );
}

export function LandingDetailedFeaturesSection({ availableProviders }: { availableProviders: MusicProviderId[] }) {
  const providerNames = formatProviderNames(availableProviders);
  const hasSpotify = availableProviders.includes('spotify');
  return (
    <div className="container mx-auto px-4 py-16 border-t border-border">
      <h2 className="text-2xl font-semibold text-center mb-12">
        See it in action
      </h2>

      <div className="max-w-6xl mx-auto space-y-16">
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

        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="rounded-xl overflow-hidden border border-border shadow-lg">
            <Image
              src="/screenshot-playlists.png"
              alt={`Playlists - Browse and manage all your ${providerNames} playlists`}
              width={1920}
              height={1080}
              className="w-full h-auto"
              unoptimized
            />
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-3">Playlists Management</h3>
            <p className="text-muted-foreground mb-4">
              Browse all your {providerNames} playlists in one organized view. Search,
              filter, and quickly access any playlist to start editing. See
              playlist details including track count, duration, and last modified
              date at a glance.
            </p>
            {hasSpotify && (
              <p className="text-sm text-muted-foreground/80 italic">
                Note: The Spotify API does not support playlist folders, so all playlists are displayed in a flat list.
              </p>
            )}
          </div>
        </div>

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
  );
}

export function LandingUseCasesSection() {
  return (
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
  );
}

export function LandingOpenSourceSection() {
  return (
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