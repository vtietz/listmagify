import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import { SignInButton } from "@/components/auth/SignInButton";
import Link from "next/link";
import { Music } from "lucide-react";

type Props = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

/**
 * Login page that handles return routing after authentication.
 * Reads 'next' query param to redirect users back to their intended destination.
 * If already authenticated, immediately redirects to the intended destination.
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

  // Determine message based on reason or session error
  const message =
    reason === "expired" || sessionError
      ? "Your session has expired. Please sign in again."
      : reason === "unauthenticated"
      ? "Sign in to access this page."
      : null;

  return (
    <div className="flex min-h-dvh items-center justify-center p-8">
      <div className="max-w-md text-center space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <Music className="h-8 w-8 text-primary" />
          <span className="text-xl font-semibold text-foreground">Listmagify</span>
        </Link>
        {message && (
          <p className="text-muted-foreground">{message}</p>
        )}
        <div className="flex justify-center">
          <SignInButton callbackUrl={returnTo} />
        </div>
        <p className="text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors underline">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}