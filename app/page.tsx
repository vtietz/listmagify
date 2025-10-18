import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";

/**
 * Root page - redirects to playlists if authenticated, otherwise to login.
 * This implements login-first UX: unauthenticated users see login screen immediately.
 */
export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session) {
    // User is authenticated, redirect to main app
    redirect("/playlists");
  } else {
    // User is not authenticated, redirect to login
    redirect("/login");
  }
}
