import { PROTECTION } from "@/features/protection/config"; // protection
import { readBiometricUnlock, readLockSetting } from "./auth/app-lock";
import { readHasDevicePin } from "./auth/device-pin";
import { getSession, setSession } from "./auth/session-state";
import { readConsents } from "./consents";
import { KEYS, wipeDeviceData } from "./storage";

/**
 * Device-level session: app lock (lib/auth/app-lock.ts), the device PIN (lib/auth/device-pin.ts),
 * biometrics (lib/auth/biometrics.ts) and one-time consents (lib/consents.ts). This module starts
 * it and resets the device; import the rest from those modules directly.
 */

export async function initSession() {
  const [lockOn, hasDevicePin, consents, biometricUnlock] = await Promise.all([readLockSetting(), readHasDevicePin(), readConsents(), readBiometricUnlock()]);
  // App lock falls back to the device PIN, so it's only on when there is one. protection: someone
  // who never chose gets it on by default (lockByDefault).
  const lockEnabled = (lockOn ?? PROTECTION.lockByDefault) && hasDevicePin;
  // A second run (Fast Refresh re-running the root layout in development) keeps whoever is in, in.
  const before = getSession();
  setSession({
    ready: true,
    lockEnabled,
    unlocked: before.ready ? before.unlocked || !lockEnabled : !lockEnabled,
    biometricUnlock,
    hasDevicePin,
    aiConsent: consents.ai,
    aiChecks: consents.checks,
    ageConfirmed: consents.age,
  });
}

/** Device settings that outlive the account: appearance, haptics and the live/Practice choice. */
const DEVICE_SETTINGS = [KEYS.theme, KEYS.haptics, KEYS.connection];

/**
 * Clears everything this phone keeps for the account (sign-out, Delete account). Stores holding a
 * copy in memory clear it through onDeviceReset (lib/storage.ts).
 *
 * devices: the install id (`vw.deviceId`) stays through a normal sign-out, so signing back in on the
 * same phone is the same, still trusted device. `forgetDevice` drops it too, so the next sign-in is a
 * new, untrusted device: after Delete account, after this phone was signed out from another device
 * (its old id stays refused) and after too many wrong PINs.
 */
export function resetDevice({ forgetDevice = false }: { forgetDevice?: boolean } = {}) {
  return wipeDeviceData({ keep: forgetDevice ? DEVICE_SETTINGS : [...DEVICE_SETTINGS, KEYS.deviceId] });
}
