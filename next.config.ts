import type { NextConfig } from "next";

// Local dev: http://127.0.0.1:8000
// Production: set NEXT_PUBLIC_API_URL (or BACKEND_URL) env var on Vercel
const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

// Static/media files backend (may be same as BACKEND_URL or a separate service)
// Set STATIC_BACKEND_URL on Vercel if your static files are served from a different origin
const STATIC_BACKEND_URL = process.env.STATIC_BACKEND_URL || BACKEND_URL;

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com/gsi/client https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://accounts.google.com https://api.razorpay.com https://checkout.razorpay.com https://api-test.ryxai.in https://ryxai.in http://127.0.0.1:8000 http://localhost:8000 https://api.cal.com",
      "frame-src https://accounts.google.com https://api.razorpay.com https://checkout.razorpay.com https://app.cal.com https://cal.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
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
