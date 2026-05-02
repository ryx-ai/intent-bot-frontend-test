import type { NextConfig } from "next";

// Local dev: http://127.0.0.1:8000
// Production: https://your-app.up.railway.app (set BACKEND_URL env var on Vercel)
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

// Static/media files backend (may be same as BACKEND_URL or a separate service)
// Set STATIC_BACKEND_URL on Vercel if your static files are served from a different origin
const STATIC_BACKEND_URL = process.env.STATIC_BACKEND_URL || BACKEND_URL;

const nextConfig: NextConfig = {
  // Proxy API calls to FastAPI backend
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: "/static/:path*",
        destination: `${STATIC_BACKEND_URL}/static/:path*`,
      },
      {
        source: "/kb-images/:path*",
        destination: `${STATIC_BACKEND_URL}/kb-images/:path*`,
      },
      {
        source: "/health",
        destination: `${BACKEND_URL}/health`,
      },
    ];
  },
};

export default nextConfig;
