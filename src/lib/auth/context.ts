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

/** Headers a proxy can set to the visitor's address. A client can send them too, so they count only when the deployment says a proxy sets them. */
const PROXY_IP_HEADERS = ["cf-connecting-ip", "x-real-ip"] as const;

/** TRUST_PROXY_HOPS: how many trusted proxies stand in front of the server (0 when unset or not a whole number). */
function trustedHops(): number {
  const n = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * The address headers to believe:
 *   - TRUST_PROXY_HEADER=cf-connecting-ip or x-real-ip: only that one (any other value: none);
 *   - otherwise, with TRUST_PROXY_HOPS >= 1: cf-connecting-ip, then x-real-ip, so the proxy must overwrite or
 *     strip both (deploy/Caddyfile sets X-Real-IP and drops Cf-Connecting-Ip);
 *   - otherwise none: with no proxy in front, a client could pick its own rate-limit key with them.
 */
function trustedIpHeaders(hops: number): readonly string[] {
  const named = process.env.TRUST_PROXY_HEADER?.trim().toLowerCase();
  if (named) return (PROXY_IP_HEADERS as readonly string[]).includes(named) ? [named] : [];
  return hops >= 1 ? PROXY_IP_HEADERS : [];
}

/**
 * The client's IP for rate limits, only from headers the deployment says a proxy controls:
 *   1. the trusted address header (trustedIpHeaders() above), which the proxy overwrites;
 *   2. else x-forwarded-for, only when TRUST_PROXY_HOPS says how many trusted proxies append to it, and then
 *      the entry the outermost trusted proxy added (counted from the right), never the client-supplied left end.
 * Null when none applies (e.g. local development with no proxy): IP limits are then skipped.
 */
export function clientIp(h: Headers): string | null {
  const hops = trustedHops();
  for (const name of trustedIpHeaders(hops)) {
    const direct = h.get(name)?.trim();
    if (direct) return direct.slice(0, 64);
  }
  const xff = h.get("x-forwarded-for");
  if (!xff || hops < 1) return null;
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
