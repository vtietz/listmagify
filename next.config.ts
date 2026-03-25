// Next.js 16.1+ uses default export without importing NextConfig type
const nextConfig = {
  // Allow dev requests from both localhost and 127.0.0.1 to prevent CORS issues
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
  ],
  // Standalone output: creates minimal production bundle with only needed dependencies
  output: 'standalone',
  // Ensure compatibility with Turbopack in Next.js 16+
  turbopack: {},
  // Allow isolated build output for E2E dev server to avoid lock conflicts
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  images: {
    remotePatterns: [
      // Spotify image CDN - album art, playlist covers, artist images
      { protocol: 'https', hostname: 'i.scdn.co' },
      // Spotify mosaic cover generator
      { protocol: 'https', hostname: 'mosaic.scdn.co' },
      // Spotify thumbnail CDN
      { protocol: 'https', hostname: 't.scdn.co' },
      // TIDAL image CDN
      { protocol: 'https', hostname: 'resources.tidal.com' },
      // E2E mock playlist artwork host
      { protocol: 'https', hostname: 'via.placeholder.com' },
    ],
  },
} as const;

export default nextConfig;
