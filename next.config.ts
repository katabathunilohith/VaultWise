import type { NextConfig } from "next";

/** Origin of the Expo web preview (`npx expo start --web` in mobile/). Native builds send no Origin, so they need no CORS. */
const MOBILE_DEV_ORIGIN = process.env.MOBILE_DEV_ORIGIN ?? "http://localhost:8081";

const nextConfig: NextConfig = {
  async headers() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: MOBILE_DEV_ORIGIN },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
