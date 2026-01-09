import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import { SignInButton } from "@/components/auth/SignInButton";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { SessionExpiredNotice } from "@/components/auth/SessionExpiredNotice";
import { AuthMessage } from "@/components/auth/AuthMessage";
import { DevModeNotice } from "@/components/auth/DevModeNotice";
import { AppLogo } from "@/components/ui/app-logo";

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

  // Default return path if none specified
  const returnTo = next && next.startsWith("/") ? next : "/playlists";

  // Check for session error (e.g., revoked refresh token)
  const sessionError = (session as { error?: string } | null)?.error;
  const hasValidSession = session && !sessionError;

  // If authenticated with valid session, redirect to intended destination
  if (hasValidSession) {
    redirect(returnTo);
  }

  // Determine messaging based on reason
  const isExpired = reason === "expired" || sessionError;
  const message = reason === "unauthenticated"
    ? "Sign in to access this page."
    : "Sign in to continue using Listmagify.";

  return (
    <AuthPageLayout>
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="flex justify-center">
            <AppLogo size="lg" asLink={false} />
          </div>

          {isExpired ? (
            <SessionExpiredNotice />
          ) : (
            <AuthMessage>{message}</AuthMessage>
          )}

          <div className="flex flex-col items-center gap-4">
            <SignInButton 
              callbackUrl={returnTo}
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-8 py-3 text-base font-medium hover:bg-primary/90 transition-colors w-full max-w-xs"
            />
            <p className="text-xs text-muted-foreground text-center">
              By signing in, you agree to our terms of service and privacy policy.
            </p>
          </div>

          <DevModeNotice />
        </div>
      </main>
    </AuthPageLayout>
  );
}
