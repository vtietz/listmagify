import type { MetadataRoute } from 'next';

// Read at runtime (server-side only)
const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/playlists/'], // Don't crawl API or private user routes
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
