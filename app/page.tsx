import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import Link from "next/link";
import { SignInButton } from "@/components/auth/SignInButton";
import { AppLogo } from "@/components/ui/app-logo";
import { SpotifyAttribution } from "@/components/ui/spotify-attribution";
import { 
  Columns, 
  GripVertical, 
  Search, 
  ArrowUpDown, 
  Copy, 
  Trash2,
  Heart,
  Play,
  Minimize2,
  Sparkles
} from "lucide-react";

/**
 * Root page - Landing page shown to all users (authenticated or not).
 * Authenticated users see "Open App" button, unauthenticated see "Sign in".
 */
export default async function Home() {
  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Listmagify",
    "applicationCategory": "MultimediaApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "description": "Professional playlist management tool for Spotify. Edit multiple playlists side-by-side with drag-and-drop."
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background to-background/95">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero Section */}
      <div className="container mx-auto px-4 pt-16 pb-12">
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          <div className="flex justify-center">
            <AppLogo size="lg" asLink={false} />
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Professional playlist management for Spotify. Edit multiple playlists side-by-side with drag-and-drop.
          </p>
          <div className="flex justify-center gap-4 pt-4">
            {isAuthenticated ? (
              <Link
                href="/playlists"
                className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Open Playlists
              </Link>
            ) : (
              <SignInButton callbackUrl="/playlists" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Free to use • Requires Spotify account • Your data stays with Spotify
          </p>
        </div>
      </div>

      {/* Screenshot Showcase */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Split Editor Screenshot */}
          <div className="rounded-xl overflow-hidden border border-border shadow-2xl">
            <img
              src="/screenshot-split-editor.png"
              alt="Split Editor - Edit multiple playlists side by side with drag and drop"
              className="w-full h-auto"
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
            icon={<Search className="h-6 w-6" />}
            title="Smart Search"
            description="Instantly filter tracks by title, artist, or album. Find what you're looking for across thousands of tracks."
          />
          <FeatureCard
            icon={<ArrowUpDown className="h-6 w-6" />}
            title="Flexible Sorting"
            description="Sort by position, title, artist, album, duration, or date added. Ascending or descending with one click."
          />
          <FeatureCard
            icon={<Copy className="h-6 w-6" />}
            title="Bulk Operations"
            description="Select multiple tracks and move, copy, or delete them at once. Perfect for large playlist reorganization."
          />
          <FeatureCard
            icon={<Play className="h-6 w-6" />}
            title="Integrated Player"
            description="Preview any track instantly with the built-in Spotify player. No need to switch apps to check a song."
          />
          <FeatureCard
            icon={<Minimize2 className="h-6 w-6" />}
            title="Compact Mode"
            description="Toggle compact view to see more tracks at once. Perfect for large playlists and smaller screens."
          />
          <FeatureCard
            icon={<Trash2 className="h-6 w-6" />}
            title="Safe Editing"
            description="Lock panels to prevent accidental changes. All edits sync directly with Spotify in real-time."
          />
          <FeatureCard
            icon={<Sparkles className="h-6 w-6" />}
            title="Smart Recommendations"
            description="Get AI-powered track suggestions based on your playlist patterns. The more you use it, the smarter it gets."
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
            <Link
              href="/playlists"
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Open Playlists
            </Link>
          ) : (
            <SignInButton callbackUrl="/split-editor" />
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 border-t border-border">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-muted-foreground">
          <SpotifyAttribution />
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/imprint" className="hover:text-foreground transition-colors">
              Imprint
            </Link>
          </div>
        </div>
      </footer>
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
