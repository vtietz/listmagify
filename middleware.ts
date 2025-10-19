import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware guards protected routes and redirects unauthorized requests to login.
 * This is the single source of truth for authentication-based redirects.
 * 
 * Protected paths: /playlists/*
 * Bypassed paths: /login, /api/auth/*, /_next/*, /favicon.ico, /api/debug/*, public assets
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Bypass middleware for public paths and auth infrastructure
  const publicPaths = [
    "/login",
    "/logout", 
    "/api/auth",
    "/_next",
    "/favicon.ico",
    "/api/debug",
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
    console.log("[middleware] No token found, redirecting to login");
    const url = req.nextUrl.clone();
    const originalPath = pathname + (req.nextUrl.search || "");
    
    url.pathname = "/login";
    url.search = `reason=unauthenticated&next=${encodeURIComponent(originalPath)}`;
    return NextResponse.redirect(url);
  }

  // Check if token is expired (if we can detect it)
  if (token.error === "RefreshAccessTokenError") {
    console.log("[middleware] Token expired, redirecting to login");
    const url = req.nextUrl.clone();
    const originalPath = pathname + (req.nextUrl.search || "");
    
    url.pathname = "/login";
    url.search = `reason=expired&next=${encodeURIComponent(originalPath)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/playlists/:path*"],
};