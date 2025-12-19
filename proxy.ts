import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Proxy guards protected routes and redirects unauthorized requests to login.
 * This is the single source of truth for authentication-based redirects.
 * 
 * Protected paths: /playlists/*, /split-editor, /stats
 * Bypassed paths: /login, /api/auth/*, /_next/*, /favicon.ico, /api/debug/*, public assets
 * 
 * Stats path: Additionally checks against STATS_ALLOWED_USER_IDS allowlist.
 * E2E Mode: When E2E_MODE=1, auth checks are bypassed for testing.
 */

/**
 * Check if a Spotify user ID is in the stats allowlist.
 * Duplicated here to avoid importing from lib (edge runtime compatibility).
 */
function isUserAllowedForStats(spotifyUserId: string | undefined | null): boolean {
  if (!spotifyUserId) return false;
  const allowedUserIds = (process.env.STATS_ALLOWED_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  return allowedUserIds.includes(spotifyUserId);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // E2E Mode: Bypass all auth checks for testing
  if (process.env.E2E_MODE === '1') {
    console.log("[proxy] E2E mode active, bypassing auth");
    return NextResponse.next();
  }

  // Bypass middleware for public paths and auth infrastructure
  const publicPaths = [
    "/login",
    "/logout", 
    "/api/auth",
    "/_next",
    "/favicon.ico",
    "/api/debug",
    "/api/test",
  ];

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check for valid session token
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET!,
  });

  if (!token) {
    console.log("[proxy] No token found, redirecting to login");
    const url = req.nextUrl.clone();
    const originalPath = pathname + (req.nextUrl.search || "");
    
    url.pathname = "/login";
    url.search = `reason=unauthenticated&next=${encodeURIComponent(originalPath)}`;
    return NextResponse.redirect(url);
  }

  // Check if token is expired (if we can detect it)
  if (token.error === "RefreshAccessTokenError") {
    console.log("[proxy] Token expired, redirecting to login");
    const url = req.nextUrl.clone();
    const originalPath = pathname + (req.nextUrl.search || "");
    
    url.pathname = "/login";
    url.search = `reason=expired&next=${encodeURIComponent(originalPath)}`;
    return NextResponse.redirect(url);
  }

  // Stats route: Check allowlist
  if (pathname.startsWith("/stats") || pathname.startsWith("/api/stats")) {
    // Get Spotify user ID from token (providerAccountId or sub)
    const spotifyUserId = (token as any).sub || (token as any).providerAccountId;
    
    console.log("[proxy] Stats access check:", {
      sub: (token as any).sub,
      providerAccountId: (token as any).providerAccountId,
      spotifyUserId,
      allowlist: process.env.STATS_ALLOWED_USER_IDS,
      isAllowed: isUserAllowedForStats(spotifyUserId),
    });
    
    if (!isUserAllowedForStats(spotifyUserId)) {
      console.log("[proxy] User not in stats allowlist, returning 403");
      return new NextResponse(
        JSON.stringify({ error: "Forbidden", message: "You do not have access to stats" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/playlists/:path*", "/split-editor", "/stats/:path*", "/api/stats/:path*"],
};