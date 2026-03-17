import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import { serverEnv } from "@/lib/env";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { LandingPageContent } from "@/components/landing/LandingPageContent";

type Props = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

function resolveReturnTo(next: string | undefined): string {
  return next && next.startsWith("/") ? next : "/split-editor";
}

function resolveLoginMessage(reason: string | undefined, sessionError: string | undefined): string | null {
  if (reason === "expired" || sessionError) {
    return "Your session has expired. Please sign in again.";
  }
  if (reason === "unauthenticated") {
    return "Sign in to access this page.";
  }
  return null;
}

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

  const returnTo = resolveReturnTo(next);
  const sessionError = (session as { error?: string } | null)?.error;
  const hasAccessToken = session && (session as any).accessToken;
  const hasValidSession = session && !sessionError && hasAccessToken;

  if (hasValidSession) {
    redirect(returnTo);
  }

  const message = resolveLoginMessage(reason, sessionError);
  const showMessage = message !== null;

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
