"use client";

import { SIGN_IN_ON } from "./config";

/**
 * This browser's device id, so the server's device rules (src/lib/devices) treat the web like any phone:
 * the sign-up device of a new wallet is trusted, any other is limited to small moves for its first 24 hours (or until trusted with a code and the MPIN) and
 * raises a `new_device` alert, and it can be signed out from the phone.
 *
 * - Sent only with sign-in on. In prototype mode the web stays an unidentified request, which the server
 *   always trusts, so the demo keeps working after a phone connects (src/lib/devices/README.md).
 * - The id is random, kept in localStorage under `vw-device-id`. It is not a secret and not a fingerprint:
 *   clearing site data gives a new id, which is simply a new (untrusted) device.
 * - When the server says this device was signed out (401 `device_revoked`), the id is marked and dropped at
 *   the next sign-out, so signing in again starts as a new device. It is not changed while still signed in,
 *   so a signed-out browser can't quietly register itself again under a fresh id.
 */
const ID_KEY = "vw-device-id";
const REVOKED_KEY = "vw-device-revoked";
const ID_OK = /^[A-Za-z0-9._:-]{8,100}$/;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function newId() {
  const raw = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web-${raw}`;
}

/** This browser's id, created on first use. Null when sign-in is off or storage is blocked. */
export function webDeviceId(): string | null {
  if (!SIGN_IN_ON) return null;
  const s = storage();
  if (!s) return null;
  const saved = s.getItem(ID_KEY);
  if (saved && ID_OK.test(saved)) return saved;
  const id = newId();
  s.setItem(ID_KEY, id);
  return id;
}

/** `x-device-id` and `x-device-platform: web` when this browser has an id; otherwise nothing. */
export function webDeviceHeaders(): Record<string, string> {
  const id = webDeviceId();
  return id ? { "x-device-id": id, "x-device-platform": "web" } : {};
}

/** Adds this browser's device headers to `headers` (see webDeviceHeaders). */
export function withWebDevice(headers: Headers) {
  for (const [k, v] of Object.entries(webDeviceHeaders())) headers.set(k, v);
}

/** The server signed this browser out (401 `device_revoked`). */
export function markWebDeviceRevoked() {
  storage()?.setItem(REVOKED_KEY, "1");
}

/** Called on sign-out: a signed-out browser starts over as a new device next time. */
export function resetWebDeviceIfRevoked() {
  const s = storage();
  if (!s || s.getItem(REVOKED_KEY) !== "1") return;
  s.removeItem(ID_KEY);
  s.removeItem(REVOKED_KEY);
}
