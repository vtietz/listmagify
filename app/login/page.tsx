import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import { SignInButton } from "@/components/auth/SignInButton";
import Link from "next/link";

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

  // If already authenticated, redirect to intended destination
  if (session) {
    redirect(returnTo);
  }

  // Determine message based on reason
  const message =
    reason === "expired"
      ? "Your session has expired. Please sign in again."
      : reason === "unauthenticated"
      ? "You need to sign in to access this page."
      : "To get started, please sign in with your Spotify account.";

  return (
    <div className="flex min-h-dvh items-center justify-center p-8">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-semibold">Welcome to Spotify Playlist Editor</h1>
        <p className="text-muted-foreground">{message}</p>
        <div className="flex justify-center gap-3">
          <SignInButton callbackUrl={returnTo} />
        </div>
      </div>
    </div>
  );
}