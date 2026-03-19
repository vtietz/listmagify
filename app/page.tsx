import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import { serverEnv } from "@/lib/env";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { LandingPageContent } from "@/components/landing/LandingPageContent";
import { PageVisitTracker } from "@/components/analytics/PageVisitTracker";
import type { MusicProviderId } from '@/lib/music-provider/types';

type Props = {
  searchParams: Promise<{ next?: string; reason?: string; error?: string; landing?: string; callbackUrl?: string }>;
};

function resolveReturnTo(next: string | undefined): string {
  return next && next.startsWith("/") ? next : "/split-editor";
}

function resolveHomeMessage(reason: string | undefined, sessionError: string | undefined): string | null {
  if (reason === "expired" || sessionError) {
    return "Your session has expired. Please sign in again.";
  }
  if (reason === "unauthenticated") {
    return "Sign in to access this page.";
  }
  return null;
}

function parseOAuthProvider(value: string | null | undefined): MusicProviderId | undefined {
  if (value === 'spotify' || value === 'tidal') {
    return value;
  }

  return undefined;
}

function resolveOAuthProviderFromCallbackUrl(callbackUrl: string | undefined): MusicProviderId | undefined {
  if (!callbackUrl) {
    return undefined;
  }

  try {
    const url = callbackUrl.startsWith('http')
      ? new URL(callbackUrl)
      : new URL(callbackUrl, serverEnv.NEXTAUTH_URL);
    return parseOAuthProvider(url.searchParams.get('provider'));
  } catch {
    if (callbackUrl.includes('provider=tidal')) {
      return 'tidal';
    }

    if (callbackUrl.includes('provider=spotify')) {
      return 'spotify';
    }

    return undefined;
  }
}

/**
 * Root page - Landing page for unauthenticated users.
 * Authenticated users with valid tokens are redirected to the app destination.
 */
export default async function Home({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const { next, reason, error, landing, callbackUrl } = await searchParams;
  const isAccessRequestEnabled = serverEnv.ACCESS_REQUEST_ENABLED ?? false;
  const oauthProvider = resolveOAuthProviderFromCallbackUrl(callbackUrl);

  const sessionError = (session as { error?: string } | null)?.error;
  const hasAccessToken = session && (session as any).accessToken;
  const hasValidSession = session && !sessionError && hasAccessToken;
  const isAuthenticated = Boolean(hasValidSession);
  const returnTo = resolveReturnTo(next);
  const forceLanding = landing === "1";

  if (hasValidSession && !forceLanding) {
    redirect(returnTo);
  }

  const message = resolveHomeMessage(reason, sessionError);
  const showMessage = message !== null;

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

  const content = (
    <>
      <PageVisitTracker />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPageContent
        isAuthenticated={isAuthenticated}
        showMessage={showMessage}
        message={message}
        returnTo={returnTo}
        oauthError={error}
        oauthProvider={oauthProvider}
        isAccessRequestEnabled={isAccessRequestEnabled}
      />
    </>
  );

  if (isAuthenticated) {
    return content;
  }

  return <AuthPageLayout showLogoutLink={false}>{content}</AuthPageLayout>;
}
