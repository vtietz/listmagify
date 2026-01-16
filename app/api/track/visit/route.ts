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
} from '@/lib/metrics/traffic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { path } = body;

    if (!path || typeof path !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid path' },
        { status: 400 }
      );
    }

    // Extract tracking data from request
    const headers = req.headers;
    const referrer = headers.get('referer') || headers.get('referrer');
    const host = headers.get('host') || '';
    
    // Get country from headers (Cloudflare/Vercel)
    const countryCode = getCountryFromHeaders(headers);
    
    // Extract referrer domain (external only)
    const referrerDomain = extractReferrerDomain(referrer, host);
    
    // Extract search query from URL
    const url = new URL(req.url);
    const searchQuery = extractSearchQuery(url.searchParams);

    // Track the visit (aggregated, no individual logs)
    trackPageVisit(path, countryCode, referrerDomain, searchQuery);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Track visit error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
