import { safeEqual, sign } from "../kyc/secret";

/**
 * findToken: lets a client ask for a password-reset email for the account it just found, without ever
 * seeing the full address. Stateless: base64url(JSON { u: userId, e: expiry }) + "." + HMAC (IDENTITY_SECRET).
 */

export const FIND_TOKEN_TTL_MS = 10 * 60_000;

export function makeFindToken(userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: now + FIND_TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The user id inside a valid, unexpired token, else null. */
export function readFindToken(token: string, now = Date.now()): string | null {
  const [payload, mac] = token.split(".");
  if (!payload || !mac || !safeEqual(sign(payload), mac)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u?: unknown; e?: unknown };
    return typeof u === "string" && typeof e === "number" && e > now ? u : null;
  } catch {
    return null;
  }
}
