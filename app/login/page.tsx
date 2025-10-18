import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import { SignInButton } from "@/components/auth/SignInButton";
import Link from "next/link";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/playlists");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-8">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-semibold">Welcome to Spotify Playlist Editor</h1>
        <p className="text-muted-foreground">
          To get started, please sign in with your Spotify account.
        </p>
        <div className="flex justify-center gap-3">
          <SignInButton />
          <Link href="/" className="text-muted-foreground hover:underline">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}