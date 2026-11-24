import { CURRENCY_SCALE } from "../shared";
import type { User } from "../users";
import { COOL_DOWN_MS, UNTRUSTED_CAP_USD } from "./config";
import type { Device } from "./store";

/* ---------- Pure rules (no database) ---------- */

/** An install id from the phone: a UUID today. "unknown" (the phone couldn't make one) and junk count as missing. */
const INSTALL_ID = /^[A-Za-z0-9._:-]{8,100}$/;
const APP_VERSION = /^[0-9A-Za-z.+_-]{1,32}$/;

export interface DeviceHeaders {
  installId: string | null;
  platform: Device["platform"];
  appVersion: string | null;
}

/** Reads `x-device-id`, `x-device-platform` and `x-app-version`. A missing or malformed value is null. */
export function readDeviceHeaders(h: Headers): DeviceHeaders {
  const id = h.get("x-device-id")?.trim() ?? "";
  const p = h.get("x-device-platform")?.trim().toLowerCase();
  const v = h.get("x-app-version")?.trim() ?? "";
  return {
    installId: INSTALL_ID.test(id) && id.toLowerCase() !== "unknown" ? id : null,
    platform: p === "ios" || p === "android" || p === "web" ? p : null,
    appVersion: APP_VERSION.test(v) ? v : null,
  };
}

/** When a device's 24-hour cool-down ends (and its cap lifts on its own). */
export function coolDownEnds(d: Pick<Device, "firstSeen">): number {
  return d.firstSeen + COOL_DOWN_MS;
}

/**
 * Trusted: trusted with a texted code and the MPIN (or the account's first device on a new account), or
 * past its cool-down if it cools down at all (a device first seen after a sign-out doesn't). Never when signed out.
 */
export function isTrusted(d: Pick<Device, "firstSeen" | "trustedAt" | "revokedAt"> & { coolsDown?: boolean }, now = Date.now()): boolean {
  if (d.revokedAt !== null) return false;
  if (d.trustedAt !== null) return true;
  return d.coolsDown !== false && now >= coolDownEnds(d);
}

/** When an untrusted device trusts itself (ms); null when it is trusted, signed out, or won't cool down. */
export function trustableAtOf(d: Pick<Device, "firstSeen" | "trustedAt" | "revokedAt"> & { coolsDown?: boolean }, now = Date.now()): number | null {
  if (isTrusted(d, now) || d.revokedAt !== null || d.coolsDown === false) return null;
  return coolDownEnds(d);
}

/**
 * Whether a sign-in made at `signedInAt` started before the account's last sign-out of a device at
 * `revokedAt` (both ms). Compared in whole seconds, as Firebase's `auth_time` is in seconds: a sign-in
 * in the same second as the sign-out counts as after it.
 */
export function signedInBefore(signedInAt: number, revokedAt: number): boolean {
  return Math.floor(signedInAt / 1000) < Math.floor(revokedAt / 1000);
}

/**
 * What an untrusted device may move out in one go, in the account's minor units: USD 50 scaled by
 * CURRENCY_SCALE and rounded to a whole unit (₹4,000, €48, £40, S$65).
 */
export function untrustedMoveCap(user: Pick<User, "currency">): number {
  return Math.round(UNTRUSTED_CAP_USD * (CURRENCY_SCALE[user.currency] ?? 1)) * 100;
}
