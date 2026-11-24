import { HttpError } from "../users";

export type DeviceErrorCode = "device_untrusted" | "device_revoked" | "device_unknown" | "device_not_found" | "signed_out";

/**
 * A device error. `extra` holds the contract's extra fields, which errorResponse() in lib/api.ts
 * spreads into the JSON next to `error` and `code`: `trustableAt` (ms since epoch, or null when
 * waiting won't help: the request didn't say which device it came from, or the device was first seen
 * after a sign-out and needs a texted code) on `device_untrusted`.
 */
export class DeviceError extends HttpError {
  constructor(
    status: number,
    message: string,
    code: DeviceErrorCode,
    public extra: { trustableAt?: number | null } = {},
  ) {
    super(status, message, code);
  }
}

export const DEVICE_REVOKED = "This device was signed out of your account. Sign in again on a device you trust.";

export function revokedError() {
  return new DeviceError(401, DEVICE_REVOKED, "device_revoked");
}

export const SESSION_ENDED = "A device was signed out of your account since you signed in here. Sign in again to continue.";

/**
 * A sign-in older than the account's last device sign-out, used from anywhere but a trusted device:
 * the same 401 `signed_out` the sign-in check gives, so the app signs in again.
 */
export function sessionEndedError() {
  return new DeviceError(401, SESSION_ENDED, "signed_out");
}
