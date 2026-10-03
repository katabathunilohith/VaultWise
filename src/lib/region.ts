/**
 * Region detection for onboarding (shared by browser and server).
 *
 * Signals, strongest first:
 *  1. network — a country header added by the hosting CDN when deployed
 *     (Vercel, Cloudflare, CloudFront). No third-party IP lookups.
 *  2. timezone — the browser's IANA time zone (where the device is set).
 *  3. language — the region subtag of the browser's languages (e.g. en-IN).
 * The person always confirms or changes the suggestion.
 */

import { COUNTRIES, countryFlag } from "./compliance";

const TIMEZONE_COUNTRY: Record<string, string> = {
  // United States
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Anchorage": "US",
  "America/Detroit": "US",
  "America/Boise": "US",
  "America/Indiana/Indianapolis": "US",
  "America/Kentucky/Louisville": "US",
  "Pacific/Honolulu": "US",
  // Canada
  "America/Toronto": "CA",
  "America/Montreal": "CA",
  "America/Vancouver": "CA",
  "America/Edmonton": "CA",
  "America/Winnipeg": "CA",
  "America/Regina": "CA",
  "America/Halifax": "CA",
  "America/St_Johns": "CA",
  // United Kingdom, India, Singapore, UAE
  "Europe/London": "GB",
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Singapore": "SG",
  "Asia/Dubai": "AE",
  // Australia
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Australia/Adelaide": "AU",
  "Australia/Hobart": "AU",
  "Australia/Darwin": "AU",
  "Australia/Canberra": "AU",
  // Euro area
  "Europe/Vienna": "AT",
  "Europe/Brussels": "BE",
  "Europe/Sofia": "BG",
  "Europe/Zagreb": "HR",
  "Asia/Nicosia": "CY",
  "Europe/Nicosia": "CY",
  "Europe/Tallinn": "EE",
  "Europe/Helsinki": "FI",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Athens": "GR",
  "Europe/Dublin": "IE",
  "Europe/Rome": "IT",
  "Europe/Riga": "LV",
  "Europe/Vilnius": "LT",
  "Europe/Luxembourg": "LU",
  "Europe/Malta": "MT",
  "Europe/Amsterdam": "NL",
  "Europe/Lisbon": "PT",
  "Europe/Bratislava": "SK",
  "Europe/Ljubljana": "SI",
  "Europe/Madrid": "ES",
};

export const GEO_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "cloudfront-viewer-country", "x-country-code"];

export type RegionSource = "network" | "timezone" | "language";

export interface RegionGuess {
  country: string | null;
  supported: boolean;
  source: RegionSource | null;
  detail: string | null;
}

export function countryFromTimezone(tz: string | null | undefined) {
  return (tz && TIMEZONE_COUNTRY[tz]) || null;
}

/** "en-IN" → "IN"; "de" → null. Ignores script subtags like "zh-Hant". */
export function countryFromLanguage(tag: string | null | undefined) {
  const m = tag?.match(/^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Za-z]{2})\b/);
  return m ? m[1].toUpperCase() : null;
}

/** Parses an Accept-Language header into tags ordered by preference. */
export function parseAcceptLanguage(header: string | null | undefined) {
  return (header ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag, q: q ? Number(q) : 1 };
    })
    .filter((x) => x.tag && x.tag !== "*")
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
}

const isSupported = (cc: string | null) => !!cc && COUNTRIES.some((c) => c.code === cc);

/** Combines the available signals, preferring a supported country at each level. */
export function detectRegion(input: { networkCountry?: string | null; timeZone?: string | null; languages?: readonly string[] | null }): RegionGuess {
  const candidates: { country: string; source: RegionSource; detail: string }[] = [];
  const net = input.networkCountry?.toUpperCase();
  if (net && /^[A-Z]{2}$/.test(net) && net !== "XX" && net !== "T1")
    candidates.push({ country: net, source: "network", detail: "your network location" });
  const tz = countryFromTimezone(input.timeZone);
  if (tz) candidates.push({ country: tz, source: "timezone", detail: `your time zone (${input.timeZone})` });
  for (const lang of input.languages ?? []) {
    const cc = countryFromLanguage(lang);
    if (cc) {
      candidates.push({ country: cc, source: "language", detail: `your browser language (${lang})` });
      break;
    }
  }
  const best = candidates.find((c) => isSupported(c.country)) ?? candidates[0];
  if (!best) return { country: null, supported: false, source: null, detail: null };
  return { country: best.country, supported: isSupported(best.country), source: best.source, detail: best.detail };
}

export function regionName(cc: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? cc;
  } catch {
    return cc;
  }
}

export { countryFlag };
