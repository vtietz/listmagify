import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/playlists/'], // Don't crawl API or private user routes
    },
    sitemap: 'https://spotlisted.com/sitemap.xml',
  };
}
