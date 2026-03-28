import { NextResponse } from 'next/server';
import { isLastfmAvailable } from '@/lib/importers/lastfm';

/**
 * GET /api/lastfm/status
 *
 * Returns whether Last.fm import is enabled (no API calls made).
 * Public endpoint — no auth required since it only checks server config.
 */
export async function GET() {
  return NextResponse.json({
    enabled: isLastfmAvailable(),
  });
}
