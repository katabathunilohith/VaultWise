/**
 * Devices, alerts, push and phone OTP (plan 06), live. client.ts spreads `securityLive` into `live`;
 * demo/devices.ts and demo/alerts.ts implement the same methods for Practice.
 *
 * Answers are read defensively (a missing or odd field becomes null), so a server a step ahead or
 * behind never breaks a screen. Money-moving rules stay on the server: these only ask and show.
 */
import { devicePlatform } from "./device";
import { post, request } from "./http";
import type { AlertItem, AlertsList, Device, DevicePlatform, OtpPurpose, OtpSent, OtpVerified } from "./security-types";

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const PLATFORMS: DevicePlatform[] = ["ios", "android", "web"];

export function toDevice(raw: unknown): Device {
  const d = obj(raw);
  const platform = str(d.platform);
  return {
    id: str(d.id) ?? "",
    platform: PLATFORMS.includes(platform as DevicePlatform) ? (platform as DevicePlatform) : "unknown",
    appVersion: str(d.appVersion ?? d.app_version),
    firstSeen: num(d.firstSeen ?? d.first_seen),
    lastSeen: num(d.lastSeen ?? d.last_seen),
    trusted: d.trusted === true,
    trustableAt: num(d.trustableAt),
    current: d.current === true,
  };
}

export function toAlert(raw: unknown): AlertItem {
  const a = obj(raw);
  return {
    id: str(a.id) ?? "",
    kind: str(a.kind) ?? "other",
    title: str(a.title) ?? "Vaultwise alert",
    body: str(a.body) ?? "",
    createdAt: num(a.createdAt ?? a.created_at) ?? 0,
    readAt: num(a.readAt ?? a.read_at),
  };
}

export const securityLive = {
  /** GET /devices: the installs signed in to this account. Revoked ones are left out. */
  devices: async (): Promise<Device[]> => {
    const r = obj(await request<unknown>("/devices"));
    return (Array.isArray(r.devices) ? r.devices : []).map(toDevice).filter((d) => d.id);
  },
  /** POST /devices/trust: trusts the phone asking, with a `device_trust` code's token and the MPIN. */
  trustDevice: (verificationToken: string, pin?: string) => post<{ ok: true }>("/devices/trust", { verificationToken, pin }),
  /** POST /devices/{id}/revoke: signs that install out at once (idempotent). */
  revokeDevice: (deviceId: string, pin?: string) => post<{ ok: true }>(`/devices/${encodeURIComponent(deviceId)}/revoke`, { pin }),

  /** GET /alerts: newest first. */
  alerts: async (): Promise<AlertsList> => {
    const r = obj(await request<unknown>("/alerts"));
    const alerts = (Array.isArray(r.alerts) ? r.alerts : []).map(toAlert).filter((a) => a.id);
    return { alerts, unread: num(r.unread) ?? alerts.filter((a) => a.readAt === null).length };
  },
  /** POST /alerts/read: these alerts, or all of them. */
  markAlertsRead: async (ids?: string[]): Promise<{ ok: true; unread: number | null }> => {
    const r = obj(await post<unknown>("/alerts/read", ids ? { ids } : {}));
    return { ok: true, unread: num(r.unread) };
  },
  /** POST /push/register: this phone's Expo push token. */
  registerPush: (token: string) => post<{ ok: true }>("/push/register", { token, platform: devicePlatform() }),
  /**
   * DELETE /push/register: stop pushing to this phone (as it signs out). `deviceId` names the install
   * that registered it, since a sign-out starts a new install id.
   */
  unregisterPush: (token: string, deviceId?: string) =>
    request<{ ok: true }>("/push/register", {
      method: "DELETE",
      body: JSON.stringify({ token }),
      headers: deviceId ? { "x-device-id": deviceId } : undefined,
    }),

  /** POST /otp/send. `phone` (E.164) only for `phone_verify`; the others go to the verified number. */
  sendOtp: async (purpose: OtpPurpose, phone?: string): Promise<OtpSent> => {
    const r = obj(await post<unknown>("/otp/send", phone ? { purpose, phone } : { purpose }));
    return {
      otpId: str(r.otpId) ?? "",
      expiresAt: num(r.expiresAt) ?? Date.now() + 5 * 60_000,
      sentTo: str(r.sentTo),
      testCode: str(r.testCode),
    };
  },
  /** POST /otp/verify: the 6-digit code for a single-use token. */
  verifyOtp: async (otpId: string, code: string): Promise<OtpVerified> => {
    const r = obj(await post<unknown>("/otp/verify", { otpId, code }));
    return {
      verificationToken: str(r.verificationToken) ?? "",
      purpose: (str(r.purpose) ?? "phone_verify") as OtpPurpose,
      expiresAt: num(r.expiresAt),
    };
  },
  /**
   * POST /me/phone: keeps the number a `phone_verify` code went to. Needs the current MPIN, adding or
   * replacing alike, always checked (the MPIN errors; a wrong one leaves the token usable, so try again
   * with the same token). Replacing a number also needs a trusted phone (`device_untrusted`, checked first).
   */
  attachPhone: (verificationToken: string, pin?: string) => post<{ ok: true }>("/me/phone", { verificationToken, pin }),
  /**
   * POST /mpin/reset: a new MPIN with a `mpin_reset` code's token (no current MPIN). Refused for 72 hours
   * after the verified number was added or changed (403 `phone_recently_changed` with `allowedAt`).
   */
  resetMpin: (verificationToken: string, newPin: string) => post<{ ok: true }>("/mpin/reset", { verificationToken, newPin }),
};
