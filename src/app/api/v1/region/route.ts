import { handle, json } from "@/lib/api";
import { detectRegion, GEO_HEADERS, parseAcceptLanguage } from "@/lib/region";

/**
 * Server-side region signals for onboarding: the CDN's country header (when
 * deployed behind Vercel/Cloudflare/CloudFront) and Accept-Language. The
 * browser adds its time zone and makes the final suggestion.
 */
export const GET = handle(async (req: Request) => {
  const networkCountry = GEO_HEADERS.map((h) => req.headers.get(h)).find(Boolean) ?? null;
  const languages = parseAcceptLanguage(req.headers.get("accept-language"));
  return json({ networkCountry, languages, guess: detectRegion({ networkCountry, languages }) });
});
