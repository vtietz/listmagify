// Next.js 16.1+ uses default export without importing NextConfig type
const nextConfig = {
  // Allow dev requests from both localhost and 127.0.0.1 to prevent CORS issues
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
  ],
} as const;

export default nextConfig;
