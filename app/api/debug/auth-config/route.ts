import { serverEnv, summarizeEnv } from "@/lib/env";
import { authOptions } from "@/lib/auth/auth";

/**
 * Debug endpoint to verify environment and computed NextAuth callback.
 * Use to diagnose "INVALID_CLIENT" by confirming:
 * - NEXTAUTH_URL
 * - Computed callback URL
 * - Providers configured
 * - Masked Spotify client ID presence and secret presence
 *
 * GET /api/debug/auth-config
 */
export async function GET() {
  const callback = new URL("/api/auth/callback/spotify", serverEnv.NEXTAUTH_URL).toString();
  const clientId = serverEnv.SPOTIFY_CLIENT_ID;
  const maskedClientId =
    clientId && clientId.length > 4 ? clientId.slice(0, 4) + "..." + clientId.slice(-4) : clientId || "[missing]";
  const maskedSecret = serverEnv.SPOTIFY_CLIENT_SECRET ? "[set]" : "[missing]";
  const providers = (authOptions.providers || []).map((p: any) => p.id || p.name || "unknown");

  const body = {
    nextauthUrl: serverEnv.NEXTAUTH_URL,
    callback,
    providers,
    spotifyClientId: maskedClientId,
    spotifyClientSecret: maskedSecret,
    envSummary: summarizeEnv(),
    hints: [
      "Spotify Dashboard Redirect URIs must include the EXACT callback URL shown here.",
      "Ensure client ID and secret in .env match your Spotify app credentials.",
      "Restart the dev server after any .env changes.",
      "For local dev, prefer NEXTAUTH_URL = http://127.0.0.1:3000 (not localhost).",
    ],
  };

  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}