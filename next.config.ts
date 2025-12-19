import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow dev requests from both localhost and 127.0.0.1 to prevent CORS issues
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ],
};

export default nextConfig;
