import { AsyncLocalStorage } from "node:async_hooks";
import { headers as nextHeaders } from "next/headers";

/**
 * The incoming request's headers for the current route call.
 *
 * `handle()` (lib/api.ts) runs every route inside `withRequest(req, ...)`, so lib code can read the
 * Authorization header without threading the request through. Outside that (a server component,
 * or code that skipped handle()), it falls back to `await headers()` from next/headers, and to no
 * headers at all when there is no request (scripts, tests that call lib code directly).
 */

const store = new AsyncLocalStorage<Headers>();

export function withRequest<T>(req: Request, fn: () => T): T {
  return store.run(req.headers, fn);
}

export async function requestHeaders(): Promise<Headers> {
  const h = store.getStore();
  if (h) return h;
  try {
    return new Headers(await nextHeaders());
  } catch {
    return new Headers();
  }
}

export function bearerToken(h: Headers): string | null {
  const raw = h.get("authorization");
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

/**
 * The client's IP for rate limits, from headers a proxy controls:
 *   1. cf-connecting-ip (Cloudflare), then x-real-ip (nginx, Vercel), which a proxy overwrites;
 *   2. x-forwarded-for only when TRUST_PROXY_HOPS says how many trusted proxies append to it, and then
 *      the entry the outermost trusted proxy added (counted from the right), never the client-supplied left end.
 * Null when none applies (e.g. local development with no proxy).
 */
export function clientIp(h: Headers): string | null {
  const direct = h.get("cf-connecting-ip")?.trim() || h.get("x-real-ip")?.trim();
  if (direct) return direct.slice(0, 64);
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  const xff = h.get("x-forwarded-for");
  if (!xff || !Number.isInteger(hops) || hops < 1) return null;
  const chain = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = chain[chain.length - hops];
  return ip ? ip.slice(0, 64) : null;
}

/**
 * Rate-limit keys for unauthenticated routes: the client IP when known, plus the app's device id as an
 * extra key (it is client-chosen, so it only ever adds a limit). Empty when neither is present; the
 * server-wide cap per route still applies then.
 */
export function clientKeys(h: Headers): string[] {
  const ip = clientIp(h);
  const device = h.get("x-device-id")?.trim().slice(0, 100);
  return [ip ? `ip:${ip}` : null, device ? `device:${device}` : null].filter((k): k is string => !!k);
}
