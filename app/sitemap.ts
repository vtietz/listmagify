import type { MetadataRoute } from 'next';

// Read at runtime (server-side only)
const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: appUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${appUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    // Add other public pages here if they exist
  ];
}
