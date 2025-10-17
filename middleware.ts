import { withAuth } from "next-auth/middleware";

/**
 * Protect authenticated routes. Unauthenticated users are redirected to /login.
 * Step 1 scope: guard /playlists and nested routes.
 */
export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/playlists/:path*"],
};