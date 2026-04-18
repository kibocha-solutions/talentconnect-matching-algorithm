import type { NextConfig } from "next";

const backendBaseUrl = (
  process.env.BACKEND_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/health",
        destination: `${backendBaseUrl}/health`,
      },
      {
        source: "/api/internal/:path*",
        destination: `${backendBaseUrl}/api/internal/:path*`,
      },
    ];
  },
};

export default nextConfig;
