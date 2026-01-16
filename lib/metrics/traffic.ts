/**
 * Traffic Analytics Module
 * 
 * Privacy-preserving traffic tracking without logging individual visits.
 * Only aggregates counts by date, page, country, referrer, and search query.
 */

import { getDb, execute } from './db';

/**
 * Extract country code from IP address using a lightweight approach.
 * Returns null if geolocation is unavailable or IP is private/localhost.
 * 
 * Note: For production, you might want to use a service like:
 * - Cloudflare headers (CF-IPCountry)
 * - Vercel geolocation (x-vercel-ip-country)
 * - maxmind-db-reader with GeoLite2 database
 */
export function getCountryFromIP(ip: string | null): string | null {
  if (!ip) return null;
  
  // Skip private/local IPs
  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.20.') ||
    ip.startsWith('172.21.') ||
    ip.startsWith('172.22.') ||
    ip.startsWith('172.23.') ||
    ip.startsWith('172.24.') ||
    ip.startsWith('172.25.') ||
    ip.startsWith('172.26.') ||
    ip.startsWith('172.27.') ||
    ip.startsWith('172.28.') ||
    ip.startsWith('172.29.') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.')
  ) {
    return null;
  }
  
  // For now, return null - this should be enhanced with actual geolocation
  // In production with Cloudflare/Vercel, use their headers
  return null;
}

/**
 * Extract country from request headers (works with Cloudflare, Vercel, etc.)
 */
export function getCountryFromHeaders(headers: Headers): string | null {
  // Cloudflare
  const cfCountry = headers.get('cf-ipcountry');
  if (cfCountry && cfCountry !== 'XX') return cfCountry;
  
  // Vercel
  const vercelCountry = headers.get('x-vercel-ip-country');
  if (vercelCountry) return vercelCountry;
  
  return null;
}

/**
 * Extract domain from referrer URL.
 * Returns null for same-domain or missing referrer.
 */
export function extractReferrerDomain(referrer: string | null, currentHost: string): string | null {
  if (!referrer) return null;
  
  try {
    const url = new URL(referrer);
    const domain = url.hostname;
    
    // Ignore same-domain referrers
    if (domain === currentHost) return null;
    
    return domain;
  } catch {
    return null;
  }
}

/**
 * Extract search query from URL search params.
 * Looks for common search parameter names: q, query, search, s
 */
export function extractSearchQuery(searchParams: URLSearchParams): string | null {
  const commonParams = ['q', 'query', 'search', 's', 'keyword'];
  
  for (const param of commonParams) {
    const value = searchParams.get(param);
    if (value && value.trim()) {
      // Truncate to prevent storing long queries
      return value.trim().substring(0, 200);
    }
  }
  
  return null;
}

/**
 * Extract UTM source from URL search params.
 * Used for tracking marketing campaigns and traffic sources.
 */
export function extractUtmSource(searchParams: URLSearchParams): string | null {
  const utmSource = searchParams.get('utm_source');
  if (utmSource && utmSource.trim()) {
    return utmSource.trim().substring(0, 100);
  }
  return null;
}

/**
 * Normalize page path by removing query parameters.
 * This ensures '/' and '/?utm_source=x' are counted together.
 */
export function normalizePagePath(path: string): string {
  // Remove query string
  const pathOnly = path.split('?')[0] || '/';
  return pathOnly === '' ? '/' : pathOnly;
}

/**
 * Track a page visit by incrementing aggregated counters.
 * No individual visit data is stored - only daily aggregates.
 * 
 * @param pagePath - The page path (e.g., '/', '/playlists')
 * @param countryCode - ISO country code (e.g., 'US', 'DE') or null
 * @param referrerDomain - External referrer domain or null
 * @param searchQuery - Search query if present in URL or null
 * @param utmSource - UTM source parameter for campaign tracking or null
 */
export function trackPageVisit(
  pagePath: string,
  countryCode: string | null,
  referrerDomain: string | null,
  searchQuery: string | null,
  utmSource: string | null
): void {
  const db = getDb();
  if (!db) return;

  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    
    // Normalize page path (remove query params)
    const normalizedPath = normalizePagePath(pagePath);
    
    // Upsert: increment count if entry exists, insert if not
    execute(
      `INSERT INTO traffic_analytics (date, page_path, country_code, referrer_domain, search_query, utm_source, visit_count)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(date, page_path, country_code, referrer_domain, search_query, utm_source)
       DO UPDATE SET visit_count = visit_count + 1`,
      [today, normalizedPath, countryCode ?? null, referrerDomain ?? null, searchQuery ?? null, utmSource ?? null]
    );
  } catch (error) {
    // Log but don't throw - metrics should never break the app
    console.error('[metrics] Failed to track page visit:', error);
  }
}

/**
 * Get traffic analytics data for the stats dashboard.
 */
export interface TrafficStats {
  totalVisits: number;
  uniqueDays: number;
  topPages: Array<{ path: string; visits: number }>;
  topCountries: Array<{ country: string; visits: number }>;
  topReferrers: Array<{ domain: string; visits: number }>;
  topSearchQueries: Array<{ query: string; visits: number }>;
  topUtmSources: Array<{ source: string; visits: number }>;
  dailyVisits: Array<{ date: string; visits: number }>;
}

export function getTrafficStats(fromDate?: string, toDate?: string): TrafficStats {
  const db = getDb();
  if (!db) {
    return {
      totalVisits: 0,
      uniqueDays: 0,
      topPages: [],
      topCountries: [],
      topReferrers: [],
      topSearchQueries: [],
      topUtmSources: [],
      dailyVisits: [],
    };
  }

  try {
    const whereClause = fromDate && toDate 
      ? `WHERE date >= ? AND date <= ?`
      : '';
    const params = fromDate && toDate ? [fromDate, toDate] : [];

    // Total visits
    const totalResult = db.prepare(
      `SELECT COALESCE(SUM(visit_count), 0) as total FROM traffic_analytics ${whereClause}`
    ).get(...params) as { total: number };

    // Unique days with visits
    const daysResult = db.prepare(
      `SELECT COUNT(DISTINCT date) as count FROM traffic_analytics ${whereClause}`
    ).get(...params) as { count: number };

    // Top pages
    const topPages = db.prepare(
      `SELECT page_path as path, SUM(visit_count) as visits
       FROM traffic_analytics ${whereClause}
       GROUP BY page_path
       ORDER BY visits DESC
       LIMIT 10`
    ).all(...params) as Array<{ path: string; visits: number }>;

    // Top countries (excluding nulls)
    const topCountries = db.prepare(
      `SELECT country_code as country, SUM(visit_count) as visits
       FROM traffic_analytics
       ${whereClause ? whereClause + ' AND' : 'WHERE'} country_code IS NOT NULL
       GROUP BY country_code
       ORDER BY visits DESC
       LIMIT 10`
    ).all(...params) as Array<{ country: string; visits: number }>;

    // Top referrers (excluding nulls)
    const topReferrers = db.prepare(
      `SELECT referrer_domain as domain, SUM(visit_count) as visits
       FROM traffic_analytics
       ${whereClause ? whereClause + ' AND' : 'WHERE'} referrer_domain IS NOT NULL
       GROUP BY referrer_domain
       ORDER BY visits DESC
       LIMIT 10`
    ).all(...params) as Array<{ domain: string; visits: number }>;

    // Top search queries (excluding nulls)
    const topSearchQueries = db.prepare(
      `SELECT search_query as query, SUM(visit_count) as visits
       FROM traffic_analytics
       ${whereClause ? whereClause + ' AND' : 'WHERE'} search_query IS NOT NULL
       GROUP BY search_query
       ORDER BY visits DESC
       LIMIT 10`
    ).all(...params) as Array<{ query: string; visits: number }>;

    // Top UTM sources (excluding nulls)
    const topUtmSources = db.prepare(
      `SELECT utm_source as source, SUM(visit_count) as visits
       FROM traffic_analytics
       ${whereClause ? whereClause + ' AND' : 'WHERE'} utm_source IS NOT NULL
       GROUP BY utm_source
       ORDER BY visits DESC
       LIMIT 10`
    ).all(...params) as Array<{ source: string; visits: number }>;

    // Daily visits
    const dailyVisits = db.prepare(
      `SELECT date, SUM(visit_count) as visits
       FROM traffic_analytics ${whereClause}
       GROUP BY date
       ORDER BY date ASC`
    ).all(...params) as Array<{ date: string; visits: number }>;

    return {
      totalVisits: totalResult.total,
      uniqueDays: daysResult.count,
      topPages,
      topCountries,
      topReferrers,
      topSearchQueries,
      topUtmSources,
      dailyVisits,
    };
  } catch (error) {
    console.error('[metrics] Failed to get traffic stats:', error);
    return {
      totalVisits: 0,
      uniqueDays: 0,
      topPages: [],
      topCountries: [],
      topReferrers: [],
      topSearchQueries: [],
      topUtmSources: [],
      dailyVisits: [],
    };
  }
}
