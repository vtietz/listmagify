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
    <div className="min-h-screen grid place-items-center p-8">
      <div className="max-w-sm w-full space-y-6 text-center">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Sign in to start organizing your Spotify playlists.
        </p>
        <SignInButton />
        <p className="text-xs text-neutral-500">
          By signing in you agree to our{" "}
          <Link href="#" className="underline underline-offset-4">
            terms
          </Link>
          .
        </p>
      </div>
    </div>
  );
}