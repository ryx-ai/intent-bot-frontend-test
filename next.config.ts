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

const IS_DEV = process.env.NODE_ENV !== "production";
// The backend's own address (the dashboard calls it for health checks).
const BACKEND_ORIGIN = [BACKEND_URL, process.env.NEXT_PUBLIC_API_URL || ""]
  .map((u) => {
    try {
      return new URL(u).origin;
    } catch {
      return "";
    }
  })
  .filter((o, i, all) => o && all.indexOf(o) === i)
  .join(" ");

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
    // Enforced: only these sources may run scripts, load frames or be called.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://checkout.razorpay.com https://*.razorpay.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      `connect-src 'self' ${BACKEND_ORIGIN} https://accounts.google.com https://*.razorpay.com https://api.cal.com${IS_DEV ? " ws: http://127.0.0.1:8000 http://localhost:8000 http://127.0.0.1:8010" : ""}`,
      "frame-src https://accounts.google.com https://*.razorpay.com https://app.cal.com https://cal.com",
      "worker-src 'self' blob:",
      "form-action 'self' https://*.razorpay.com",
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
