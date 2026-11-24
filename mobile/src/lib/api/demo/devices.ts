/**
 * devices, phone OTP and MPIN reset in Practice (plan 06), mirroring the server's codes and rules:
 *
 * - One device to start with, "This phone", trusted (the sign-up device of a fresh account is).
 * - A phone is trusted once trusted with a code and the MPIN, or 24 hours after it was first seen
 *   (`practiceTrusted`, the server's isTrusted). A phone first seen after a device was signed out of
 *   the account (`coolsDown: false`) never trusts itself: `trustableAt` is null and only a code and
 *   the MPIN trust it. An untrusted phone can move at most USD 50 (scaled and rounded to a whole unit,
 *   ₹4,000) at a time out of the account: 403 `device_untrusted` with `trustableAt`. The money moves
 *   that the server checks call `assertPracticeDeviceCap()` with the amount asked for, before the
 *   MPIN, as the server does (lines marked `// devices`).
 * - Codes are always 123456 and come back as `testCode`; 6 digits, 5 minutes, 3 tries, 5 sends an
 *   hour, single-use tokens valid 10 minutes.
 * - Trusting this phone needs a `device_trust` token and the MPIN; signing a device out needs the
 *   MPIN; adding or replacing the phone number needs a `phone_verify` token and the MPIN (the
 *   `phone_change` action: always checked, and a wrong MPIN leaves the token usable); resetting the
 *   MPIN needs a `mpin_reset` token from a trusted phone, and a number on the account for 72 hours
 *   (403 `phone_recently_changed` with `allowedAt`; proving the same number again doesn't restart it).
 *
 * Only the masked phone number is kept, with a one-way key of the whole number to tell "the same
 * number again" apart, and the slice is `sensitive` (secure storage, not the bulk save). Codes and
 * tokens live in memory only. Not simulated: the new-device limit (`registered: false`) and the
 * 401 `signed_out` for sign-ins older than a device sign-out (Practice can't sign itself out).
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { checkNewMpin } from "@/features/mpin/policy";
import { money } from "../../money";
import { appVersionName, devicePlatform } from "../device";
import { ApiError } from "../errors";
import { CURRENCY_SCALE } from "../pay-sim";
import type { Device, DevicePlatform, MeDevice, MePhone, OtpPurpose, OtpSent, OtpVerified } from "../security-types";
import { practiceAlert } from "./alerts";
import { resetPracticeMpin, requirePracticeMpin } from "./mpin";
import { registerPracticeSlice, savePracticeSoon } from "./persist";
import { currency, DAY, newId, wait } from "./state";

const HOUR = 3_600_000;
const OTP_MS = 5 * 60_000;
const TOKEN_MS = 10 * 60_000;
const OTP_TRIES = 3;
const SENDS_PER_HOUR = 5;
/** A number added or changed can't reset the MPIN for this long (the server's PHONE_RESET_HOLD_MS). */
const PHONE_RESET_HOLD_MS = 72 * HOUR;
/** The Practice code, returned as `testCode` like a server in test mode. */
export const PRACTICE_OTP = "123456";

interface DemoDevice {
  id: string;
  platform: DevicePlatform;
  appVersion: string;
  firstSeen: number;
  lastSeen: number;
  trustedAt: number | null;
  revokedAt: number | null;
  current: boolean;
  /** false: first seen after a device was signed out, so it never trusts itself (missing in older saves: it does). */
  coolsDown?: boolean;
}

interface DevicesState {
  devices: DemoDevice[];
  /** The verified number, masked only; `verifiedAt` is when it was added or changed (the reset hold counts from it). */
  phone: { masked: string; verifiedAt: number; numberKey?: string } | null;
  /** When a device was last signed out of the account (devices first seen after it don't cool down). */
  lastSignOutAt: number | null;
}

/** A one-way key of a whole number, so "the same number again" can be told without keeping it. */
const numberKeyOf = (e164: string) => bytesToHex(sha256(utf8ToBytes(`vaultwise-practice:${e164}`)));

const fresh = (now = Date.now()): DevicesState => ({
  devices: [
    {
      id: "dev_this_phone",
      platform: devicePlatform(),
      appVersion: appVersionName(),
      firstSeen: now - 30 * DAY,
      lastSeen: now,
      trustedAt: now - 30 * DAY,
      revokedAt: null,
      current: true,
    },
  ],
  phone: null,
  lastSignOutAt: null,
});

const D: DevicesState = fresh();

registerPracticeSlice<DevicesState>({
  key: "devices",
  // The phone number (masked) is personal: kept in secure storage, so the slice stays small (signed-out devices are dropped).
  sensitive: true,
  save: () => ({
    devices: [...D.devices.filter((d) => d.current), ...D.devices.filter((d) => !d.current && d.revokedAt === null).slice(-7)],
    phone: D.phone,
    lastSignOutAt: D.lastSignOutAt,
  }),
  load: (saved) => {
    if (!Array.isArray(saved?.devices) || !saved.devices.some((d) => d?.current)) throw new Error("Not Practice devices");
    const masked = saved.phone?.masked;
    const numberKey = saved.phone?.numberKey;
    Object.assign(D, {
      devices: saved.devices,
      phone:
        typeof masked === "string" && masked.length <= 20
          ? { masked, verifiedAt: Number(saved.phone?.verifiedAt) || Date.now(), ...(typeof numberKey === "string" ? { numberKey } : {}) }
          : null,
      lastSignOutAt: typeof saved.lastSignOutAt === "number" ? saved.lastSignOutAt : null,
    });
  },
  reset: () => Object.assign(D, fresh()),
});

/* ---------- this phone, and the untrusted-phone cap ---------- */

function thisPhone(): DemoDevice {
  let d = D.devices.find((x) => x.current && x.revokedAt === null);
  if (!d) {
    // Can't happen from the screens (This phone has no Sign out); start it again rather than lock Practice.
    d = fresh().devices[0];
    D.devices = [d, ...D.devices.filter((x) => !x.current)];
  }
  return d;
}

/**
 * The server's isTrusted() (src/lib/devices/rules.ts): trusted with a code and the MPIN (or the
 * sign-up device), or 24 hours past its first sight if it cools down at all (one first seen after a
 * device sign-out doesn't); never once signed out. Used for every rule here: /me, the list, signing
 * out, changing the number, resetting the MPIN and the cap. Pure.
 */
export function practiceTrusted(d: Pick<DemoDevice, "trustedAt" | "firstSeen" | "revokedAt" | "coolsDown">, now = Date.now()) {
  if (d.revokedAt !== null) return false;
  if (d.trustedAt !== null) return true;
  return d.coolsDown !== false && now >= d.firstSeen + DAY;
}

/**
 * When an untrusted phone trusts itself (24 hours after first sight); null once trusted, signed out,
 * or when it never will (first seen after a device sign-out), as the server's trustableAtOf(). Pure.
 */
export function practiceTrustableAt(d: Pick<DemoDevice, "trustedAt" | "firstSeen" | "revokedAt" | "coolsDown">, now = Date.now()) {
  return practiceTrusted(d, now) || d.revokedAt !== null || d.coolsDown === false ? null : d.firstSeen + DAY;
}
const trustableAt = (d: DemoDevice, now = Date.now()) => practiceTrustableAt(d, now);

/** otp: the server's assertPhoneSettled(): a number added or changed in the last 72 hours can't reset the MPIN. */
function assertPhoneSettled(now = Date.now()) {
  if (!D.phone) return;
  const allowedAt = D.phone.verifiedAt + PHONE_RESET_HOLD_MS;
  if (now >= allowedAt) return;
  const hours = Math.ceil((allowedAt - now) / HOUR);
  throw new ApiError(
    `Your phone number was added or changed recently, so for your safety it can't be used to reset your MPIN for the next ${hours === 1 ? "1 hour" : `${hours} hours`}. If you didn't change it, contact support.`,
    403,
    "phone_recently_changed",
    { allowedAt },
  );
}

/** USD 50 in the wallet's currency, rounded to a whole unit, in minor units (the server's `untrustedMoveCap`). Pure. */
export const untrustedCapFor = (cur: string) => Math.round(50 * (CURRENCY_SCALE[cur] ?? 1)) * 100;

function untrustedError(message: string, d: DemoDevice) {
  return new ApiError(message, 403, "device_untrusted", { trustableAt: trustableAt(d) });
}

/**
 * The server's untrusted-device rule for one move out of the account (withdraw, wallet spend,
 * wallet cash-out, emergency). Call it with the amount asked for, before the MPIN, as the server does.
 */
export function assertPracticeDeviceCap(amountMinor: number, now = Date.now()) {
  const cap = untrustedCapFor(currency);
  if (amountMinor <= cap) return;
  const d = thisPhone();
  if (practiceTrusted(d, now)) return;
  throw untrustedError(
    `This phone isn't trusted yet, so it can move up to ${money(cap, currency)} at a time for now. Trust it with a code and your MPIN.`,
    d,
  );
}

/** What the Practice /me says about the phone number and this phone. */
export function practiceSecurityMe(): { phone: MePhone; device: MeDevice } {
  const d = thisPhone();
  return {
    phone: { number: D.phone?.masked ?? null, verified: D.phone !== null },
    device: { registered: true, trusted: practiceTrusted(d), trustableAt: trustableAt(d) },
  };
}

const view = (d: DemoDevice): Device => ({
  id: d.id,
  platform: d.platform,
  appVersion: d.appVersion,
  firstSeen: d.firstSeen,
  lastSeen: d.lastSeen,
  trusted: practiceTrusted(d),
  trustableAt: trustableAt(d),
  current: d.current,
});

const PLATFORM_NAME: Record<DevicePlatform, string> = { ios: "An iPhone", android: "An Android phone", web: "A web browser", unknown: "A device" };

/* ---------- codes and tokens (memory only) ---------- */

interface Otp {
  purpose: OtpPurpose;
  /** Masked: where it "went". */
  sentTo: string;
  /** phone_verify: the one-way key of the whole number (numberKeyOf). */
  numberKey: string | null;
  expiresAt: number;
  tries: number;
  used: boolean;
}
const otps = new Map<string, Otp>();
const tokens = new Map<string, { purpose: OtpPurpose; sentTo: string; numberKey: string | null; expiresAt: number; used: boolean }>();
let sends: number[] = [];

/** `+919876543210` → `+91••••••3210`, like the server. */
const maskPhone = (e164: string) => `${e164.slice(0, 3)}${"•".repeat(Math.max(0, e164.length - 7))}${e164.slice(-4)}`;

/** A token for this purpose that's still good (not used up: the caller does that once everything else passed). */
function peekToken(token: string, purpose: OtpPurpose, now = Date.now()) {
  const t = tokens.get(token);
  if (!t || t.used || t.expiresAt < now || t.purpose !== purpose)
    throw new ApiError("That code has expired or was already used. Ask for a new one.", 400, "verification_invalid");
  return t;
}

export const devicesDemo = {
  devices: async (): Promise<Device[]> => {
    await wait(250);
    thisPhone().lastSeen = Date.now();
    return D.devices.filter((d) => d.revokedAt === null).map(view);
  },
  trustDevice: async (verificationToken: string, pin?: string) => {
    await wait(500);
    // The server's order: the MPIN (always checked), then the token.
    requirePracticeMpin(pin);
    const t = peekToken(verificationToken, "device_trust");
    t.used = true;
    const d = thisPhone();
    if (d.trustedAt === null) {
      d.trustedAt = Date.now();
      practiceAlert("device_trusted", "This phone is trusted now", "It can move any amount. Trusted with a code to your phone and your MPIN.");
    }
    return { ok: true as const };
  },
  revokeDevice: async (deviceId: string, pin?: string) => {
    await wait(400);
    // The server's order: the MPIN, then the device, then whether this phone may sign it out.
    requirePracticeMpin(pin);
    const d = D.devices.find((x) => x.id === deviceId && x.revokedAt === null);
    if (!d) throw new ApiError("That device isn't signed in anymore.", 404, "device_not_found");
    const me = thisPhone();
    if (!d.current && !practiceTrusted(me) && practiceTrusted(d))
      throw untrustedError("This phone isn't trusted yet, so it can't sign out a trusted one. Trust it first.", me);
    // The screens never offer this phone; Practice keeps it signed in rather than lock itself out.
    if (d.current) throw new ApiError("This is the phone you're using. To leave Vaultwise here, delete the Practice account in Settings.", 400);
    d.revokedAt = Date.now();
    // Devices first seen from now on don't trust themselves with time (the server's cool_down = 0).
    D.lastSignOutAt = d.revokedAt;
    practiceAlert("device_revoked", "A device was signed out", `${PLATFORM_NAME[d.platform]} was signed out of Vaultwise from this phone.`);
    return { ok: true as const };
  },

  sendOtp: async (purpose: OtpPurpose, phone?: string): Promise<OtpSent> => {
    await wait(500);
    const now = Date.now();
    // The server's order: the route's device and hold checks, then the number, then the send limits.
    let sentTo: string;
    let numberKey: string | null = null;
    if (purpose === "phone_verify") {
      if (D.phone && !practiceTrusted(thisPhone()))
        throw untrustedError("This phone isn't trusted yet, so it can't change your verified number.", thisPhone());
      const n = (phone ?? "").replace(/[\s()-]/g, "");
      if (!/^\+[1-9]\d{7,14}$/.test(n)) throw new ApiError("Enter the whole number, starting with + and the country code.", 400, "phone_invalid");
      sentTo = maskPhone(n);
      numberKey = numberKeyOf(n);
    } else {
      if (purpose === "mpin_reset") {
        if (!practiceTrusted(thisPhone())) throw untrustedError("This phone isn't trusted yet, so it can't reset your MPIN. Use your trusted phone.", thisPhone());
        assertPhoneSettled(now); // otp: 72 hours after the number was added or changed
      }
      if (!D.phone) throw new ApiError("Add and verify a phone number first.", 409, "phone_required");
      sentTo = D.phone.masked;
    }
    sends = sends.filter((t) => t > now - HOUR);
    if (sends.length >= SENDS_PER_HOUR)
      throw new ApiError("That's 5 codes in an hour. Wait a while, then ask for a new one.", 429, "otp_rate_limited", { retryAt: sends[0] + HOUR });
    sends.push(now);
    // A new code replaces earlier unused ones for the same purpose, as on the server.
    for (const [id, o] of otps) if (o.purpose === purpose && !o.used) otps.delete(id);
    const otpId = newId("otp");
    otps.set(otpId, { purpose, sentTo, numberKey, expiresAt: now + OTP_MS, tries: 0, used: false });
    return { otpId, expiresAt: now + OTP_MS, sentTo, testCode: PRACTICE_OTP };
  },
  verifyOtp: async (otpId: string, code: string): Promise<OtpVerified> => {
    await wait(400);
    const now = Date.now();
    const o = otps.get(otpId);
    if (!o) throw new ApiError("That code isn't valid anymore. Ask for a new one.", 404, "otp_not_found");
    if (o.used) throw new ApiError("That code was already used. Ask for a new one.", 410, "otp_used");
    if (o.expiresAt < now) throw new ApiError("That code has expired. Ask for a new one.", 410, "otp_expired");
    if (o.tries >= OTP_TRIES) throw new ApiError("That's too many wrong tries for this code. Ask for a new one.", 410, "otp_exhausted");
    if (code !== PRACTICE_OTP) {
      o.tries += 1;
      const triesLeft = OTP_TRIES - o.tries;
      if (triesLeft <= 0) throw new ApiError("That's too many wrong tries for this code. Ask for a new one.", 410, "otp_exhausted");
      throw new ApiError(`That code isn't right. ${triesLeft === 1 ? "1 try" : `${triesLeft} tries`} left.`, 400, "otp_wrong", { triesLeft });
    }
    o.used = true;
    const verificationToken = newId("vtok");
    tokens.set(verificationToken, { purpose: o.purpose, sentTo: o.sentTo, numberKey: o.numberKey, expiresAt: now + TOKEN_MS, used: false });
    return { verificationToken, purpose: o.purpose, expiresAt: now + TOKEN_MS };
  },
  /**
   * POST /me/phone with the MPIN (the `phone_change` action). The server's order: a trusted phone (to
   * replace a number), then the MPIN (always checked, wrong tries count toward the lock), then the
   * token, so a wrong MPIN leaves the token usable for the next try.
   */
  attachPhone: async (verificationToken: string, pin?: string) => {
    await wait(350);
    if (D.phone && !practiceTrusted(thisPhone()))
      throw untrustedError("This phone isn't trusted yet, so it can't change your verified number.", thisPhone());
    requirePracticeMpin(pin);
    const t = peekToken(verificationToken, "phone_verify");
    t.used = true;
    // The number that's already verified: nothing changes, and the 72-hour hold doesn't start again.
    const same = !!D.phone && (D.phone.numberKey && t.numberKey ? D.phone.numberKey === t.numberKey : D.phone.masked === t.sentTo);
    if (same) return { ok: true as const };
    D.phone = { masked: t.sentTo, verifiedAt: Date.now(), ...(t.numberKey ? { numberKey: t.numberKey } : {}) };
    practiceAlert(
      "phone_verified",
      "Phone number verified",
      "Codes for new phones and MPIN resets now go to your verified number. For your safety it can't be used to reset your MPIN for the next 72 hours. If this wasn't you, talk to a person.",
    ); // protection: no number in the bulk save
    return { ok: true as const };
  },
  resetMpin: async (verificationToken: string, newPin: string) => {
    await wait(500);
    // The server's order: the policy, then a trusted phone, then the 72-hour hold, then the token.
    const policy = checkNewMpin(newPin);
    if (!policy.ok) throw new ApiError(policy.message, 400, "mpin_weak", { reason: policy.reason });
    const me = thisPhone();
    if (!practiceTrusted(me)) throw untrustedError("This phone isn't trusted yet, so it can't reset your MPIN. Use your trusted phone.", me);
    assertPhoneSettled(); // otp
    const t = peekToken(verificationToken, "mpin_reset");
    resetPracticeMpin(newPin);
    t.used = true;
    practiceAlert("mpin_changed", "MPIN reset", "Your MPIN was reset with a code sent to your verified number. If this wasn't you, talk to a person."); // protection
    return { ok: true as const };
  },
};

/**
 * Practice-only ways to try the rules without a second phone (Your devices → "Try it in Practice").
 * They're outside the API, so they save the Practice data themselves.
 */
export const practiceDeviceTools = {
  /**
   * Another phone signs in: untrusted, with a "new device" alert. After a device was signed out, it
   * never trusts itself with time (only a code and the MPIN would), as on the server.
   */
  signInElsewhere() {
    const now = Date.now();
    const platform: DevicePlatform = devicePlatform() === "ios" ? "android" : "ios";
    const coolsDown = D.lastSignOutAt === null;
    D.devices = [
      ...D.devices,
      { id: newId("dev"), platform, appVersion: appVersionName(), firstSeen: now, lastSeen: now, trustedAt: null, revokedAt: null, current: false, coolsDown },
    ];
    practiceAlert(
      "new_device",
      "New sign-in on another phone",
      `${PLATFORM_NAME[platform]} signed in to your account. If this wasn't you, sign it out in Your devices.`,
    );
    savePracticeSoon();
  },
  /**
   * This phone becomes a new, untrusted one (first seen now), so the 24-hour rule and trusting it can
   * be tried. After a device was signed out (sign out the pretend phone first), it's a phone first seen
   * after a sign-out: no 24-hour wait, only a code and the MPIN trust it.
   */
  startAsNewPhone() {
    const d = thisPhone();
    d.firstSeen = Date.now();
    d.trustedAt = null;
    d.coolsDown = D.lastSignOutAt === null;
    practiceAlert(
      "new_device",
      "New sign-in on this phone",
      d.coolsDown
        ? "Until it's trusted, large amounts wait 24 hours. Trust it with a code to your phone and your MPIN."
        : "A device was signed out of your account before this phone signed in, so large amounts wait until you trust it with a code to your phone and your MPIN.",
    );
    savePracticeSoon();
  },
};
