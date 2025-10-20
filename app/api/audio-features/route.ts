import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { fetchAudioFeatures } from "@/lib/spotify/fetchers";

/**
 * POST /api/audio-features
 * 
 * Fetches audio features for multiple tracks with caching.
 * Request body: { trackIds: string[] }
 * Returns: { features: Record<string, AudioFeatures> }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "token_expired" }, { status: 401 });
    }

    // Check if there's a session error (refresh failed)
    if ((session as any).error === "RefreshAccessTokenError") {
      return NextResponse.json({ error: "token_expired" }, { status: 401 });
    }

    const body = await request.json();
    const trackIds = body?.trackIds;

    if (!Array.isArray(trackIds)) {
      return NextResponse.json({ error: "Invalid request: trackIds must be an array" }, { status: 400 });
    }

    if (trackIds.length === 0) {
      return NextResponse.json({ features: {} });
    }

    // Validate all IDs are strings
    if (!trackIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "Invalid request: all trackIds must be strings" }, { status: 400 });
    }

    // Fetch audio features with caching
    console.log("[api/audio-features] Fetching audio features", { count: trackIds.length, sample: trackIds.slice(0, 5) });
    const featuresMap = await fetchAudioFeatures(trackIds);

    console.log("[api/audio-features] Received features", { size: featuresMap.size });
    // Convert Map to plain object for JSON serialization
    const features: Record<string, any> = {};
    featuresMap.forEach((value, key) => {
      features[key] = value;
    });

    return NextResponse.json({ features });
  } catch (error) {
    console.error("[api/audio-features] Error:", error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized") || errorMessage.includes("access token expired")) {
      return NextResponse.json({ error: "token_expired" }, { status: 401 });
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
