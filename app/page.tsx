import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { serverEnv } from "@/lib/env";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { LandingPageContent } from "@/components/landing/LandingPageContent";

type Props = {
  searchParams: Promise<{ next?: string; reason?: string; error?: string }>;
};

/**
 * Root page - Landing page shown to all users (authenticated or not).
 * Shows the landing page with features and sign-in options.
 * 
 * When authenticated: relies on AppShell (global wrapper) to show main nav
 * When not authenticated: uses AuthPageLayout with minimal header
 */
export default async function Home({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const { next, reason, error } = await searchParams;
  const isAccessRequestEnabled = serverEnv.ACCESS_REQUEST_ENABLED ?? false;

  // Check for session error (e.g., revoked refresh token)
  const sessionError = (session as { error?: string } | null)?.error;
  const hasValidSession = session && !sessionError;

  // Default return path for sign-in button
  const returnTo = next && next.startsWith("/") ? next : "/split-editor";

  // Determine message based on reason or session error
  const showMessage = reason === "expired" || !!sessionError || reason === "unauthenticated";
  const message =
    reason === "expired" || sessionError
      ? "Your session has expired. Please sign in again."
      : reason === "unauthenticated"
      ? "Sign in to access this page."
      : null;

  const isAuthenticated = hasValidSession;

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
        isAccessRequestEnabled={isAccessRequestEnabled}
      />
    </>
  );

  // When authenticated, render content directly (global AppShell provides header/nav)
  if (isAuthenticated) return content;

  // When not authenticated, use AuthPageLayout with minimal header
  return <AuthPageLayout showLogoutLink={false}>{content}</AuthPageLayout>;
}
