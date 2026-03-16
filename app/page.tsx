import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import { serverEnv } from "@/lib/env";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { LandingPageContent } from "@/components/landing/LandingPageContent";
import { PageVisitTracker } from "@/components/analytics/PageVisitTracker";

type Props = {
  searchParams: Promise<{ next?: string; reason?: string; error?: string }>;
};

/**
 * Root page - Landing page for unauthenticated users.
 * Authenticated users with valid tokens are redirected to the app destination.
 */
export default async function Home({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const { next, reason, error } = await searchParams;
  const isAccessRequestEnabled = serverEnv.ACCESS_REQUEST_ENABLED ?? false;

  // Check for session error (e.g., revoked refresh token)
  const sessionError = (session as { error?: string } | null)?.error;
  
  // Additional validation: ensure session has a valid access token
  // This prevents showing "Open App" when the session exists but token is invalid
  const hasAccessToken = session && (session as any).accessToken;
  const hasValidSession = session && !sessionError && hasAccessToken;

  // Default return path for sign-in button
  const returnTo = next && next.startsWith("/") ? next : "/split-editor";

  // If authenticated with valid session, skip landing page and go to app
  if (hasValidSession) {
    redirect(returnTo);
  }

  // Determine message based on reason or session error
  const showMessage = reason === "expired" || !!sessionError || reason === "unauthenticated";
  const message =
    reason === "expired" || sessionError
      ? "Your session has expired. Please sign in again."
      : reason === "unauthenticated"
      ? "Sign in to access this page."
      : null;

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

  // When not authenticated, use AuthPageLayout with minimal header
  return <AuthPageLayout showLogoutLink={false}>{content}</AuthPageLayout>;
}
