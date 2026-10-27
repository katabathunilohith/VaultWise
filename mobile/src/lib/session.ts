import { readLockSetting } from "./auth/app-lock";
import { readHasDevicePin } from "./auth/device-pin";
import { setSession } from "./auth/session-state";
import { readConsents } from "./consents";
import { KEYS, wipeDeviceData } from "./storage";

/**
 * Device-level session: app lock (lib/auth/app-lock.ts), the device PIN (lib/auth/device-pin.ts),
 * biometrics (lib/auth/biometrics.ts) and one-time consents (lib/consents.ts). This module starts
 * it and resets the device; import the rest from those modules directly.
 */

export async function initSession() {
  const [lockOn, hasDevicePin, consents] = await Promise.all([readLockSetting(), readHasDevicePin(), readConsents()]);
  // App lock falls back to the device PIN, so it's only on when there is one.
  const lockEnabled = lockOn && hasDevicePin;
  setSession({ ready: true, lockEnabled, unlocked: !lockEnabled, hasDevicePin, aiConsent: consents.ai, aiChecks: consents.checks, ageConfirmed: consents.age });
}

/** Device settings that outlive the account: appearance, haptics and the live/Practice choice. */
const DEVICE_SETTINGS = [KEYS.theme, KEYS.haptics, KEYS.connection];

/**
 * Clears everything this phone keeps for the account (Delete account). Stores holding a copy in
 * memory clear it through onDeviceReset (lib/storage.ts).
 */
export function resetDevice() {
  return wipeDeviceData({ keep: DEVICE_SETTINGS });
}
