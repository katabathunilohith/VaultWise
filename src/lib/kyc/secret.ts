import crypto from "node:crypto";
import { authMode } from "../auth/config";
import { HttpError } from "../users";
import { normaliseId, type DocType } from "./ids";

/**
 * ID numbers are matched by HMAC-SHA256 with a server secret (IDENTITY_SECRET), so the database
 * never holds a number that could be read back. Changing the secret breaks matching for every
 * record made before the change (recovery and duplicate checks); rotate by re-verifying.
 */

const DEV_SECRET = "vaultwise-dev-identity-secret-do-not-use-in-production";
let warned = false;

/**
 * The dev key is only for prototype mode and tests. With sign-in on (firebase mode) or in production a
 * missing IDENTITY_SECRET is a setup error: refuse rather than hash real ID numbers with a key in the source.
 */
function secret(): string {
  const s = process.env.IDENTITY_SECRET?.trim();
  if (s) return s;
  if (authMode() === "firebase" || process.env.NODE_ENV === "production") {
    console.error("[identity] IDENTITY_SECRET is not set. Set a long random value before using sign-in, ID checks or recovery.");
    throw new HttpError(500, "ID checks aren't set up on this server yet.", "server_config");
  }
  if (!warned) {
    warned = true;
    console.warn("[identity] IDENTITY_SECRET is not set: using a fixed development key for ID matching. Set it before real use.");
  }
  return DEV_SECRET;
}

/** Throws the setup error early (before any work) when the secret is required but missing. */
export function assertIdentitySecret() {
  secret();
}

/** HMAC of the ID type and its normalised number. The same ID always gives the same hash. */
export function idHash(docType: DocType, number: string): string {
  return crypto.createHmac("sha256", secret()).update(`${docType}:${normaliseId(number)}`).digest("hex");
}

/** Signs a small payload (used for short-lived recovery tokens). */
export function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(`token:${payload}`).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
