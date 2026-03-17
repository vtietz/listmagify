import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import { serverEnv } from "@/lib/env";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { LandingPageContent } from "@/components/landing/LandingPageContent";
import { PageVisitTracker } from "@/components/analytics/PageVisitTracker";

type Props = {
  searchParams: Promise<{ next?: string; reason?: string; error?: string; landing?: string }>;
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

/**
 * Root page - Landing page for unauthenticated users.
 * Authenticated users with valid tokens are redirected to the app destination.
 */
export default async function Home({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const { next, reason, error, landing } = await searchParams;
  const isAccessRequestEnabled = serverEnv.ACCESS_REQUEST_ENABLED ?? false;

  const sessionError = (session as { error?: string } | null)?.error;
  const hasAccessToken = session && (session as any).accessToken;
  const hasValidSession = session && !sessionError && hasAccessToken;
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
        isAuthenticated={false}
        showMessage={showMessage}
        message={message}
        returnTo={returnTo}
        oauthError={error}
        isAccessRequestEnabled={isAccessRequestEnabled}
      />
    </>
  );

  return <AuthPageLayout showLogoutLink={false}>{content}</AuthPageLayout>;
}
