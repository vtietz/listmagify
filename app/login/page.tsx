import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import { serverEnv } from "@/lib/env";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { LandingPageContent } from "@/components/landing/LandingPageContent";

type Props = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

/**
 * Login page that handles session expiration and authentication redirects.
 * Reuses shared auth components for a consistent, focused login experience.
 * 
 * If user is already authenticated with a valid session, redirects to the next page.
 * Otherwise, shows login prompt with appropriate messaging based on the reason.
 */
export default async function LoginPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const { next, reason } = await searchParams;
  const isAccessRequestEnabled = serverEnv.ACCESS_REQUEST_ENABLED ?? false;

  // Default return path if none specified
  const returnTo = next && next.startsWith("/") ? next : "/split-editor";

  // Check for session error (e.g., revoked refresh token)
  const sessionError = (session as { error?: string } | null)?.error;
  
  // Additional validation: ensure session has a valid access token
  // This prevents auto-redirect when session exists but token is invalid
  const hasAccessToken = session && (session as any).accessToken;
  const hasValidSession = session && !sessionError && hasAccessToken;

  // If authenticated with valid session, redirect to intended destination
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

  return (
    <AuthPageLayout showLogoutLink={false}>
      <LandingPageContent
        isAuthenticated={false}
        showMessage={showMessage}
        message={message}
        returnTo={returnTo}
        isAccessRequestEnabled={isAccessRequestEnabled}
      />
    </AuthPageLayout>
  );
}
