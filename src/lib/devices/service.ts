import { newId, tx } from "../db";
import { audit } from "../audit";
import { fmtMoney } from "../shared";
import type { User } from "../users";
import { authMode } from "../auth/config";
import { requestHeaders } from "../auth/context";
import { moneyPolicy, type MoneyAction } from "../money-routes";
import { alertDeviceRevoked, alertDeviceTrusted, alertNewDevice, durationText, removePushTokensForDevice } from "../alerts";
import { consumeVerification } from "../otp";
import { devicesEnforced, LAST_SEEN_EVERY_MS, MAX_ACTIVE_DEVICES, NEW_ACCOUNT_WINDOW_MS, NEW_DEVICES_PER_HOUR } from "./config";
import { DeviceError, revokedError, sessionEndedError } from "./errors";
import { isTrusted, readDeviceHeaders, signedInBefore, trustableAtOf, untrustedMoveCap } from "./rules";
import {
  accountRevokedAt,
  activeDeviceCount,
  activeDevices,
  deviceById,
  deviceByInstall,
  deviceCount,
  devicesFirstSeenSince,
  insertDevice,
  markAccountRevoked,
  markRevoked,
  markSeen,
  markTrusted,
  walletOpenedAt,
  type Device,
} from "./store";

const HOUR_MS = 3_600_000;

/**
 * The device a request came from, and what it may do.
 *
 * Requests without a usable `x-device-id` are "unidentified": they aren't recorded and can't be trusted
 * or signed out. Every current client sends an id (the phone always; the web with sign-in on, see
 * src/components/identity/device.ts), so:
 * - in prototype mode (no sign-in, one customer) an unidentified request counts as trusted, so the web
 *   demo keeps working;
 * - in firebase mode it is untrusted and never cools down (`trustableAt: null`), whatever devices the
 *   account has; otherwise leaving the header off would skip every device rule.
 * A request whose id wasn't recorded because the account hit the new-device limit is unidentified and
 * untrusted in both modes.
 */
export interface DeviceContext {
  /** The registered device, or null for an unidentified request. */
  device: Device | null;
  /** May move money without the new-device cap, sign out trusted devices, change the phone number and reset the MPIN. */
  trusted: boolean;
  /** When an untrusted device's cool-down ends (ms); null when trusted, or when waiting won't help. */
  trustableAt: number | null;
}

function contextFor(device: Device | null, now: number, opts: { refusedId?: boolean } = {}): DeviceContext {
  if (device) return { device, trusted: isTrusted(device, now), trustableAt: trustableAtOf(device, now) };
  return { device: null, trusted: !opts.refusedId && authMode() === "prototype", trustableAt: null };
}

/** The wallet was opened within the last hour: its first device is the one that signed up. */
function isNewAccount(userId: string, now: number): boolean {
  const opened = walletOpenedAt(userId);
  return opened !== null && now - opened <= NEW_ACCOUNT_WINDOW_MS;
}

/** Room for one more device row: at most 5 new ones an hour and 20 signed in at once. */
function roomForNewDevice(userId: string, now: number): boolean {
  return devicesFirstSeenSince(userId, now - HOUR_MS) < NEW_DEVICES_PER_HOUR && activeDeviceCount(userId) < MAX_ACTIVE_DEVICES;
}

/**
 * Records the calling device for a customer request and returns what it may do. Called by
 * `session()` (lib/auth/session.ts) on every request that resolves a wallet with full access (not for
 * a recovery claimant's read-only access, which isn't a device of the wallet).
 *
 * - First sight: a row is added, unless the account already added 5 devices this hour or has 20 signed
 *   in (then nothing is written, no alert is raised, and the request counts as unidentified). The
 *   account's first device is trusted at once only on a wallet opened in the last hour; any other
 *   device starts untrusted, is audited, and raises a `new_device` alert. A device first seen after a
 *   device was signed out of the account doesn't cool down: only a texted code and the MPIN trust it.
 * - A signed-out (revoked) device: 401 `device_revoked`.
 * - `signedInAt` (firebase mode: the token's `auth_time`): a sign-in that started before the account's
 *   last device sign-out is refused with 401 `signed_out` unless it comes from a trusted, signed-in
 *   device of the account, so signing a stolen phone out also ends that sign-in elsewhere.
 * - Otherwise `last_seen` (at most once a minute), platform and app version are kept current.
 * The refusals apply with DEVICES_ENFORCED on.
 */
export function touchDevice(user: Pick<User, "id">, headers: Headers, opts: { now?: number; signedInAt?: number | null } = {}): DeviceContext {
  const now = opts.now ?? Date.now();
  const enforced = devicesEnforced();
  const revokedAt = accountRevokedAt(user.id);
  const stale = enforced && revokedAt !== null && typeof opts.signedInAt === "number" && signedInBefore(opts.signedInAt, revokedAt);
  const h = readDeviceHeaders(headers);
  if (!h.installId) {
    const ctx = contextFor(null, now);
    if (stale && !ctx.trusted) throw sessionEndedError();
    return ctx;
  }
  let device = deviceByInstall(user.id, h.installId);
  if (!device) {
    if (stale) throw sessionEndedError(); // before anything is written
    if (!roomForNewDevice(user.id, now)) return contextFor(null, now, { refusedId: true });
    // The first device is trusted at once only when it is the one that signed up. Prototype mode (no
    // sign-in, one local customer) has no stolen sign-ins to guard against, so its first device is
    // trusted whatever the wallet's age, as before; later devices still start untrusted there.
    const trustNow = deviceCount(user.id) === 0 && (authMode() === "prototype" || isNewAccount(user.id, now));
    const fresh: Device = {
      id: newId("dev"),
      userId: user.id,
      installId: h.installId,
      platform: h.platform,
      appVersion: h.appVersion,
      firstSeen: now,
      lastSeen: now,
      trustedAt: trustNow ? now : null,
      revokedAt: null,
      coolsDown: revokedAt === null,
    };
    if (insertDevice(fresh)) {
      audit({
        userId: user.id,
        actor: user.id,
        actorType: "user",
        action: "device.registered",
        entityType: "device",
        entityId: fresh.id,
        details: { platform: h.platform, appVersion: h.appVersion, trusted: trustNow, coolsDown: fresh.coolsDown },
        ts: now,
      });
      if (!trustNow) alertNewDevice(user.id, h.platform);
    }
    device = deviceByInstall(user.id, h.installId)!;
  } else if (device.revokedAt !== null) {
    if (enforced) throw revokedError();
  } else {
    if (stale && !isTrusted(device, now)) throw sessionEndedError();
    if (now - device.lastSeen >= LAST_SEEN_EVERY_MS || (h.platform && h.platform !== device.platform) || (h.appVersion && h.appVersion !== device.appVersion)) {
      markSeen(device.id, now, h.platform, h.appVersion);
      device = { ...device, lastSeen: now, platform: h.platform ?? device.platform, appVersion: h.appVersion ?? device.appVersion };
    }
  }
  return contextFor(device, now);
}

/** The calling device's context without writing anything (the request was already recorded by `session()`). */
export function deviceContext(user: Pick<User, "id">, headers: Headers, now = Date.now()): DeviceContext {
  const { installId } = readDeviceHeaders(headers);
  if (!installId) return contextFor(null, now);
  const device = deviceByInstall(user.id, installId);
  // An id with no row was refused by the new-device limit: unidentified, and untrusted in both modes.
  return device ? contextFor(device, now) : contextFor(null, now, { refusedId: true });
}

/** `deviceContext()` for the current request's headers. */
export async function currentDevice(user: Pick<User, "id">, now = Date.now()): Promise<DeviceContext> {
  return deviceContext(user, await requestHeaders(), now);
}

/* ---------- What an untrusted device may do ---------- */

function waitHint(ctx: DeviceContext, now: number) {
  return ctx.trustableAt !== null ? ` for the next ${durationText(ctx.trustableAt - now)}` : "";
}

/**
 * The money-out cap for untrusted devices. Money routes call it after parsing the body, next to
 * `requireMpin()`, with the amount in minor units. Applies to actions marked `deviceCap` in
 * src/lib/money-routes.ts. Over the cap on an untrusted device: 403 `device_untrusted` with
 * `trustableAt`. The cap is per move; the account's own limits still apply on top.
 */
export async function assertDeviceMayMove(user: Pick<User, "id" | "currency">, amountMinor: number, action: MoneyAction, now = Date.now()) {
  if (!moneyPolicy(action).deviceCap || !devicesEnforced()) return;
  const cap = untrustedMoveCap(user);
  if (amountMinor <= cap) return;
  const ctx = await currentDevice(user, now);
  if (ctx.trusted) return;
  const max = fmtMoney(cap, user.currency, { decimals: false });
  const message = !ctx.device
    ? `This app didn't say which device it's on, so it can send up to ${max} at a time. Use the Vaultwise app on your phone to send more.`
    : !ctx.device.coolsDown
      ? `This device was first used after a device was signed out of your account, so it can send up to ${max} at a time until you trust it in Settings > Devices with a texted code and your MPIN.`
      : `This device is new to your account, so it can send up to ${max} at a time${waitHint(ctx, now)}. To send more now, trust it in Settings > Devices with a texted code and your MPIN.`;
  throw new DeviceError(403, message, "device_untrusted", { trustableAt: ctx.trustableAt });
}

const SENSITIVE = {
  phone_change: "change your verified phone number",
  mpin_reset: "reset your MPIN",
} as const;

/**
 * Account changes a stolen sign-in on a new phone must not make during the cool-down: replacing the
 * verified phone number (it receives the codes) and resetting the MPIN. 403 `device_untrusted` with
 * `trustableAt` unless the calling device is trusted.
 */
export function assertTrustedDevice(ctx: DeviceContext, what: keyof typeof SENSITIVE, now = Date.now()) {
  if (ctx.trusted || !devicesEnforced()) return;
  const later = ctx.trustableAt !== null ? `, or try again in ${durationText(ctx.trustableAt - now)}` : ", or trust this one with a texted code and your MPIN";
  const message = ctx.device
    ? `This device is new to your account, so it can't ${SENSITIVE[what]} yet. Use a device you've trusted${later}.`
    : `This app didn't say which device it's on, so it can't ${SENSITIVE[what]}. Use the Vaultwise app on your phone.`;
  throw new DeviceError(403, message, "device_untrusted", { trustableAt: ctx.trustableAt });
}

/* ---------- Trusting and signing out ---------- */

/** The calling device's row; 400 `device_unknown` for an unidentified request (nothing to trust). */
export function assertRegisteredDevice(ctx: DeviceContext): Device {
  if (ctx.device) return ctx.device;
  throw new DeviceError(400, "This app didn't say which device it's on, so it can't be trusted. Update the app and try again.", "device_unknown");
}

/**
 * Trusts the calling device with a verification token from a texted code (purpose `device_trust`).
 * The route checks the MPIN first. 400 `device_unknown` for an unidentified request. Already trusted:
 * nothing changes and the token is left unused. Audited; raises a `device_trusted` alert.
 */
export function trustDevice(user: Pick<User, "id">, ctx: DeviceContext, verificationToken: string, now = Date.now()) {
  const device = assertRegisteredDevice(ctx);
  if (device.trustedAt !== null) return;
  tx(() => {
    consumeVerification(user, verificationToken, "device_trust", now);
    markTrusted(device.id, now);
    audit({ userId: user.id, actor: user.id, actorType: "user", action: "device.trusted", entityType: "device", entityId: device.id, details: { platform: device.platform }, ts: now });
    alertDeviceTrusted(user.id, device.platform);
  });
}

/**
 * Signs a device out of the account: every later request from it gets 401 `device_revoked`, and its
 * push tokens are removed. The time is also kept on the account (`users.devices_revoked_at`), so a
 * sign-in that started before it is refused (401 `signed_out`) unless it comes from a trusted device,
 * and a device first seen after it needs a texted code and the MPIN to be trusted (see touchDevice()).
 *
 * The route checks the MPIN first. A device may sign itself out, and any untrusted device; signing out
 * a trusted device needs a trusted caller (403 `device_untrusted`), so a stolen sign-in on a new phone
 * can't lock the owner's phone out during the cool-down. 404 `device_not_found` for a device that
 * isn't on this account. Signing out twice is a no-op.
 */
export function revokeDevice(user: Pick<User, "id">, deviceId: string, ctx: DeviceContext, now = Date.now()) {
  const target = deviceById(user.id, deviceId);
  if (!target) throw new DeviceError(404, "That device isn't on your account.", "device_not_found");
  if (target.revokedAt !== null) return;
  const self = ctx.device?.id === target.id;
  if (!self && !ctx.trusted && isTrusted(target, now) && devicesEnforced())
    throw new DeviceError(
      403,
      "Only a trusted device can sign out a trusted device. Trust this device first with a texted code and your MPIN.",
      "device_untrusted",
      { trustableAt: ctx.trustableAt },
    );
  tx(() => {
    markRevoked(target.id, now);
    markAccountRevoked(user.id, now);
    removePushTokensForDevice(user.id, target.id);
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: "device.revoked",
      entityType: "device",
      entityId: target.id,
      details: { platform: target.platform, self, by: ctx.device?.id ?? null },
      ts: now,
    });
    alertDeviceRevoked(user.id, target.platform);
  });
}

/* ---------- Views ---------- */

/** GET /devices: the devices still signed in, most recently used first. */
export function listDevices(user: Pick<User, "id">, ctx: DeviceContext, now = Date.now()) {
  return activeDevices(user.id).map((d) => ({
    id: d.id,
    platform: d.platform,
    appVersion: d.appVersion,
    firstSeen: d.firstSeen,
    lastSeen: d.lastSeen,
    trusted: isTrusted(d, now),
    trustableAt: trustableAtOf(d, now),
    current: ctx.device?.id === d.id,
  }));
}

/** GET /me: the calling device. `registered` is false for an unidentified request. */
export function deviceStatus(ctx: DeviceContext): { registered: boolean; trusted: boolean; trustableAt: number | null } {
  return { registered: !!ctx.device, trusted: ctx.trusted, trustableAt: ctx.trustableAt };
}
