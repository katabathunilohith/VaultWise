/**
 * devices, alerts and phone OTP (plan 06): the shapes of their endpoints, as the phone reads them
 * (docs/plans/contracts.md, "Devices, alerts and OTP"). Times are ms since epoch.
 */
import type { Millis } from "./types";

export type DevicePlatform = "ios" | "android" | "web" | "unknown";

/** GET /devices: one signed-in install. */
export interface Device {
  id: string;
  platform: DevicePlatform;
  appVersion: string | null;
  firstSeen: Millis | null;
  lastSeen: Millis | null;
  trusted: boolean;
  /** While untrusted: when large amounts can move from it. Null = never automatically (trust it instead). */
  trustableAt: Millis | null;
  /** The phone asking. */
  current: boolean;
}

/** /me `device`: the phone asking. */
export interface MeDevice {
  registered?: boolean;
  trusted: boolean;
  trustableAt: Millis | null;
}

/** /me `phone`: the verified number, masked (`+91••••••3210`). */
export interface MePhone {
  number: string | null;
  verified: boolean;
}

export type AlertKind =
  "new_device" | "device_trusted" | "device_revoked" | "money_out" | "limit_loosened" | "mpin_locked" | "mpin_changed" | "phone_verified";

export interface AlertItem {
  id: string;
  /** One of AlertKind; an unknown kind from a newer server still shows, with a plain icon. */
  kind: AlertKind | (string & {});
  title: string;
  body: string;
  createdAt: Millis;
  readAt: Millis | null;
}

/** GET /alerts: newest first, with how many are unread. */
export interface AlertsList {
  alerts: AlertItem[];
  unread: number;
}

export type OtpPurpose = "phone_verify" | "device_trust" | "mpin_reset";

/** POST /otp/send. `testCode` only from a server in test mode (and always "123456" in Practice). */
export interface OtpSent {
  otpId: string;
  expiresAt: Millis;
  /** Where the code went, masked. */
  sentTo: string | null;
  testCode: string | null;
}

/** POST /otp/verify: a single-use token for the action the code was for (valid 10 minutes). */
export interface OtpVerified {
  verificationToken: string;
  purpose: OtpPurpose;
  expiresAt: Millis | null;
}
