/**
 * Track Page Visit API
 * 
 * Lightweight endpoint to track page visits without authentication.
 * POST /api/track/visit
 * Body: { path: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  trackPageVisit,
  getCountryFromHeaders,
  extractReferrerDomain,
  extractSearchQuery,
  extractUtmSource,
} from '@/lib/metrics/traffic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { path, referrer: clientReferrer } = body;

    if (!path || typeof path !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid path' },
        { status: 400 }
      );
    }

    // Extract tracking data from request
    const headers = req.headers;
    // Use client-provided referrer (from document.referrer) instead of HTTP referer header
    // The HTTP referer header in a fetch() call is always the current page, not the external referrer
    const referrer = clientReferrer || null;
    const host = headers.get('host') || '';
    
    // Get country from headers (Cloudflare/Vercel)
    const countryCode = getCountryFromHeaders(headers);
    
    // Extract referrer domain (external only)
    const referrerDomain = extractReferrerDomain(referrer, host);
    
    // Parse URL to extract UTM and search params
    const url = new URL(path, `http://${host}`);
    const searchQuery = extractSearchQuery(url.searchParams);
    const utmSource = extractUtmSource(url.searchParams);

    // Track the visit (aggregated, no individual logs)
    trackPageVisit(path, countryCode, referrerDomain, searchQuery, utmSource);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Track visit error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
