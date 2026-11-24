import { get, run } from "../db";
import { currentUser, HttpError, type User } from "../users";
import { adminEmails, authMode, kycGateOn, type AuthMode } from "./config";
import { bearerToken, requestHeaders } from "./context";
import { identityByUid, isClosed, type Identity } from "./identities";
import { TokenError, verifyIdToken, type VerifiedToken } from "./verify";
import { settleExpiredClaimFor } from "../recovery/claims"; // recovery
import { touchDevice, type DeviceContext } from "../devices"; // devices
import { checkRateLimit, generalLimitPerMinute } from "../rate-limit"; // rate-limit

/**
 * Request-scoped identity. Prototype mode: the first user, no sign-in (exactly as before).
 * Firebase mode: the Bearer ID token → identity → wallet.
 */
export interface Session {
  mode: AuthMode;
  /** The verified token (firebase mode only). */
  token: VerifiedToken | null;
  identity: Identity | null;
  /** The wallet this request may use, or null when there is none yet. */
  user: User | null;
  /** "recovery" while a recovery claim waits for a person: read-only. */
  access: "full" | "recovery";
  /**
   * devices: the device this request came from and what it may do; null when there is no wallet yet,
   * and for a recovery claimant's read-only access (the claimant isn't a device of that wallet).
   */
  device: DeviceContext | null; // devices
}

export const SIGNED_OUT = "Sign in to continue.";
export const NO_WALLET = "You don't have a wallet yet. Finish setting up first.";
export const RECOVERY_RESTRICTED = "Your account is being checked. Money can't move until a person confirms it's you.";
export const KYC_REQUIRED = "Verify your ID to move money.";
export const ADMIN_ONLY = "Only the operations team can do this.";

const userById = (id: string) => get<User>("SELECT * FROM users WHERE id = ?", id) ?? null;

/**
 * devices: records the calling device for this wallet; 401 device_revoked for a signed-out device, and
 * 401 signed_out for a sign-in older than the account's last device sign-out (unless from a trusted device).
 */
const attachDevice = async (user: User, signedInAt: number | null = null) => touchDevice(user, await requestHeaders(), { signedInAt }); // devices

/**
 * rate-limit: the general per-minute limit per signed-in person (firebase mode; prototype mode has no
 * sign-in, so the per-IP limit in handle() is all). Here rather than in customer() so it also covers
 * GET /me and runs before the device is recorded. A recovery claimant is counted by its own sign-in,
 * so it can't use up the wallet owner's limit.
 */
function limitPerson(key: string) {
  checkRateLimit(`all:${key}`, generalLimitPerMinute(), 60_000);
}

/** Verifies the request's token. Throws 401 signed_out when it is missing or invalid. */
export async function signedIn(): Promise<VerifiedToken> {
  const token = bearerToken(await requestHeaders());
  if (!token) throw new HttpError(401, SIGNED_OUT, "signed_out");
  try {
    return await verifyIdToken(token);
  } catch (e) {
    if (e instanceof TokenError) throw new HttpError(401, SIGNED_OUT, "signed_out");
    throw e;
  }
}

export async function session(): Promise<Session> {
  if (authMode() === "prototype") {
    const user = currentUser() ?? null; // devices
    return { mode: "prototype", token: null, identity: null, user, access: "full", device: user ? await attachDevice(user) : null }; // devices
  }
  const token = await signedIn();
  let identity = identityByUid(token.uid) ?? null;
  if (identity?.status === "recovery_pending") {
    settleExpiredClaimFor(token.uid); // recovery: a claim nobody decided in 7 days lapses
    identity = identityByUid(token.uid) ?? null;
  }
  if (identity && token.email && identity.email !== token.email) {
    run("UPDATE identities SET email = ?, updated_at = ? WHERE uid = ?", token.email, Date.now(), token.uid);
    identity = { ...identity, email: token.email };
  }
  const usable = identity && identity.user_id && identity.status !== "disabled" && !isClosed(identity.user_id);
  const user = usable ? userById(identity!.user_id!) : null;
  const access = user && identity?.status === "recovery_pending" ? "recovery" : "full";
  if (user) limitPerson(access === "recovery" ? `uid:${token.uid}` : `user:${user.id}`); // rate-limit
  return {
    mode: "firebase",
    token,
    identity,
    user,
    access,
    // devices: a claimant with read-only recovery access never becomes a device of the wallet it claims.
    device: user && access === "full" ? await attachDevice(user, token.signedInAt) : null, // devices
  };
}

/**
 * The wallet for this request, with the access and KYC gates applied.
 * A sign-in with provisional recovery access may only use routes that opt in with `recovery: true`
 * (read-only summaries); everything else, reads included, answers 403 recovery_restricted.
 */
export async function resolveCustomer(
  opts: { access?: "read" | "write"; kyc?: boolean; recovery?: boolean } = {},
): Promise<{ user: User; session: Session }> {
  const s = await session();
  if (!s.user) {
    // Prototype keeps today's answer; firebase mode says the person is signed in but has no wallet.
    if (s.mode === "prototype") throw new HttpError(401, "No wallet yet — complete onboarding first", "no_wallet");
    throw new HttpError(404, NO_WALLET, "no_wallet");
  }
  if (s.access === "recovery" && ((opts.access ?? "write") === "write" || !opts.recovery))
    throw new HttpError(403, RECOVERY_RESTRICTED, "recovery_restricted");
  if (opts.kyc) assertKycGate(s.user);
  return { user: s.user, session: s };
}

/**
 * The ID-check gate on its own: 403 kyc_required unless the ID is verified (off with KYC_ENFORCED=false).
 * `resolveCustomer({ kyc: true })` applies it; `moneyGate()` in lib/api.ts applies it once a route knows that
 * this request moves money (POST /vaults with an opening deposit).
 */
export function assertKycGate(user: Pick<User, "kyc_status">) {
  if (kycGateOn() && user.kyc_status !== "verified") throw new HttpError(403, KYC_REQUIRED, "kyc_required");
}

/** Never throws: the wallet if this request has full access to one, else null. */
export async function optionalUser(): Promise<User | null> {
  try {
    const s = await session();
    return s.access === "full" ? s.user : null;
  } catch {
    return null;
  }
}

export function reload(user: User): User {
  return userById(user.id) ?? user;
}

/**
 * Admin routes. Prototype mode: open, as before (returns null; callers use their default reviewer).
 * Firebase mode: a signed-in, verified email listed in ADMIN_EMAILS; returns that email.
 */
export async function requireAdmin(): Promise<string | null> {
  if (authMode() === "prototype") return null;
  const token = await signedIn();
  if (!token.email || !token.emailVerified || !adminEmails().includes(token.email)) throw new HttpError(403, ADMIN_ONLY, "admin_only");
  return token.email;
}

/** True when this request comes from an admin (never throws). */
export async function isAdminRequest(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}
