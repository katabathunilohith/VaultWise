/**
 * devices (plan 06): who this install is, told to the server on every request, and the one place
 * that hears "this device was signed out" (401 `device_revoked`).
 *
 * Headers (docs/plans/contracts.md, "Headers the phone sends"):
 * - `x-device-id`: a random id for this install, kept in `vw.deviceId` (the server counts recovery
 *   tries per phone with it, and registers the device on sign-in). It stays through a normal
 *   sign-out; a new one comes with Delete account, a remote sign-out, too many wrong PINs and a
 *   reinstall (resetDevice({ forgetDevice }) in lib/session.ts; on iOS the fresh-install wipe in
 *   lib/storage.ts), and when a server without sign-in says this one was signed out (forgetInstallId).
 * - `x-device-platform`: `ios`, `android` or `web`.
 * - `x-app-version`: `expo.version` from the app config.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { onUserChange } from "../auth/firebase";
import { getItemStrict, KEYS, onDeviceReset, removeItem, setItem } from "../storage";

const DEVICE_ID_KEY = KEYS.deviceId;
/** How long to wait before reading the saved id a second time. */
const RETRY_READ_MS = 250;
let deviceId: Promise<string> | null = null;

/** The saved id, or null when none is saved. Throws when storage can't be read, even after a second try. */
async function readSavedId(): Promise<string | null> {
  try {
    return await getItemStrict(DEVICE_ID_KEY);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_READ_MS));
    return await getItemStrict(DEVICE_ID_KEY);
  }
}

/**
 * A random id for this install, sent as `x-device-id`. A new one is made only when none is saved:
 * a read that fails (twice) gives "unknown" for this run (the server treats it as none) and leaves
 * the saved id alone, because a new id is a new, untrusted device and an alert to the owner.
 */
export function installId(): Promise<string> {
  deviceId ??= (async () => {
    let saved: string | null;
    try {
      saved = await readSavedId();
    } catch {
      return "unknown";
    }
    if (saved) return saved;
    const id = Crypto.randomUUID();
    await setItem(DEVICE_ID_KEY, id);
    return id;
  })().catch(() => "unknown");
  return deviceId;
}

/**
 * devices: drops this install's id, so the next request comes from a new device. For a server
 * without sign-in that answered `device_revoked` (features/devices useDeviceWatch): there is nobody
 * to sign out, and the old id stays refused for good.
 */
export function forgetInstallId(): Promise<void> {
  const forgotten = removeItem(DEVICE_ID_KEY);
  // Requests from now on wait for the old id to go, then make a new one.
  deviceId = forgotten.then(() => {
    deviceId = null;
    return installId();
  });
  return forgotten;
}

/**
 * After any wipe, read the id from storage again. A normal sign-out keeps it (same, trusted device);
 * Delete account and a remote sign-out remove it, so the next request gets a new id and the server
 * sees a new (untrusted) device. That's what lets a phone signed out from another device
 * (401 `device_revoked`) sign in again at all, since the old id stays revoked.
 */
onDeviceReset(() => {
  deviceId = null;
});

/** What the server calls this platform. */
export function devicePlatform(): "ios" | "android" | "web" {
  return Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
}

export function appVersionName(): string {
  return Constants.expoConfig?.version ?? "unknown";
}

/** The three device headers, for every request to the Vaultwise API. */
export async function deviceHeaders(): Promise<Record<string, string>> {
  return { "x-device-id": await installId(), "x-device-platform": devicePlatform(), "x-app-version": appVersionName() };
}

/* ---------- 401 device_revoked: another device signed this one out ---------- */

let revoked = false;
const revokedListeners = new Set<() => void>();

/** http.ts calls this when the server answers 401 `device_revoked`. */
export function noteDeviceRevoked() {
  revoked = true;
  for (const fn of [...revokedListeners]) fn();
}

/**
 * Hears a 401 `device_revoked` (features/devices signs out of Vaultwise). A revocation seen before
 * anyone listened is told straight away. Returns the unsubscribe.
 */
export function onDeviceRevoked(fn: () => void): () => void {
  revokedListeners.add(fn);
  if (revoked) fn();
  return () => {
    revokedListeners.delete(fn);
  };
}

/** Called once the sign-out has run, so the next sign-in starts clean. */
export function clearDeviceRevoked() {
  revoked = false;
}

// A new sign-in starts clean too, even if a late 401 from the old session landed after the sign-out.
onUserChange(() => clearDeviceRevoked());
