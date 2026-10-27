import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type KeyInput } from "jose";
import { firebaseProjectId } from "./config";

/**
 * Firebase ID token verification with jose, following Firebase's rules for third-party JWT libraries:
 * RS256, signed by one of Google's securetoken keys, issuer https://securetoken.google.com/<project>,
 * audience <project>, a non-empty subject (the uid), not expired, auth_time not in the future.
 */

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface VerifiedToken {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /** Firebase sign-in provider, e.g. "password", "google.com", "phone". */
  provider: string;
}

export class TokenError extends Error {}

let remote: JWTVerifyGetKey | null = null;
let override: KeyInput | JWTVerifyGetKey | null = null;

/**
 * Tests (or a self-hosted emulator) can verify with their own key instead of Google's.
 * Pass null to go back to Google's published keys.
 */
export function setVerificationKey(key: KeyInput | JWTVerifyGetKey | null) {
  override = key;
}

function keySource(): KeyInput | JWTVerifyGetKey {
  if (override) return override;
  remote ??= createRemoteJWKSet(new URL(JWKS_URL), { cooldownDuration: 30_000, cacheMaxAge: 6 * 3_600_000 });
  return remote;
}

export async function verifyIdToken(token: string): Promise<VerifiedToken> {
  const projectId = firebaseProjectId();
  if (!projectId) throw new TokenError("Sign-in is not configured");
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySource(), {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"],
      clockTolerance: 5,
    }));
  } catch (e) {
    throw new TokenError((e as Error)?.message ?? "Invalid token");
  }
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) throw new TokenError("Token has no subject");
  const authTime = payload.auth_time;
  if (typeof authTime === "number" && authTime * 1000 > Date.now() + 5 * 60_000) throw new TokenError("auth_time is in the future");
  const firebase = (payload.firebase ?? {}) as { sign_in_provider?: unknown };
  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    emailVerified: payload.email_verified === true,
    provider: typeof firebase.sign_in_provider === "string" ? firebase.sign_in_provider : "unknown",
  };
}
