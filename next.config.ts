import type { NextConfig } from "next";

/** Origin of the Expo web preview (`npx expo start --web` in mobile/). Native builds send no Origin, so they need no CORS. */
const MOBILE_DEV_ORIGIN = process.env.MOBILE_DEV_ORIGIN ?? "http://localhost:8081";

/**
 * Firebase sign-in on the web (src/components/identity/session.ts) talks to *.googleapis.com, and on some
 * browsers opens a hidden frame on the project's auth domain (<project>.firebaseapp.com, or a custom one)
 * plus Google's script loader. A custom auth domain is read at build time, like the other NEXT_PUBLIC_ values.
 */
const AUTH_DOMAIN = (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "").trim();
const authFrame = /^[a-z0-9.-]+$/i.test(AUTH_DOMAIN) && !/\.(firebaseapp\.com|web\.app)$/i.test(AUTH_DOMAIN) ? ` https://${AUTH_DOMAIN}` : "";

/**
 * Content Security Policy for the web pages, without nonces (the "Without Nonces" setup in
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md), because most pages are static.
 * - script-src needs 'unsafe-inline' for Next's inline bootstrap scripts and the theme script in layout.tsx.
 *   Production React and Next don't use eval, so no 'unsafe-eval'.
 * - style-src needs 'unsafe-inline' for the inline styles React, Next and the charts write.
 * - img-src blob: is for photo previews and signed-in downloads (URL.createObjectURL).
 * - The AI provider (Groq) is only called by the server, so it isn't listed.
 * - No upgrade-insecure-requests: every URL is relative and HSTS covers HTTPS, and it would break a local
 *   `npm start` check over http://localhost.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://www.google.com",
  `frame-src 'self' https://*.firebaseapp.com https://*.web.app https://www.google.com${authFrame}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Plan 05: sent on every response by the production server. Caddy (deploy/Caddyfile) passes them through. */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    if (process.env.NODE_ENV === "production") return [{ source: "/:path*", headers: SECURITY_HEADERS }];
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: MOBILE_DEV_ORIGIN },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
          // The phone app's own headers: device id, AI consent, platform and app version.
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Device-Id, X-AI-Consent, X-Device-Platform, X-App-Version" },
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
