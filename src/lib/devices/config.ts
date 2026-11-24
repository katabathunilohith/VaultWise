/**
 * The devices module's switch and fixed numbers. The switch is read on every call, so a test (or a
 * restart with new env) can flip it.
 *
 *   DEVICES_ENFORCED  unset or anything but "false" → on (the default): a new device can move money out
 *                     only up to the cap below for 24 hours (or until trusted with a texted code and the
 *                     MPIN), a signed-out device is refused on every request, a sign-in older than the
 *                     account's last sign-out is refused unless it comes from a trusted device, and a new
 *                     device can't sign out a trusted one, change the verified phone number or reset the MPIN.
 *                     "false" → rollback mode: devices are still recorded and alerts still raised, but
 *                     nothing is refused.
 */
export function devicesEnforced(): boolean {
  return process.env.DEVICES_ENFORCED?.trim().toLowerCase() !== "false";
}

/** What a new (untrusted) device may move out per move, in USD; scaled per currency through CURRENCY_SCALE. */
export const UNTRUSTED_CAP_USD = 50;

/** How long after a device is first seen the cap lifts on its own (not for a device first seen after a sign-out). */
export const COOL_DOWN_MS = 24 * 3_600_000;

/**
 * The account's first device is trusted at once only when the wallet was opened this recently (the device
 * that signed up). On an older account with no devices yet, the first device starts untrusted like any other.
 */
export const NEW_ACCOUNT_WINDOW_MS = 3_600_000;

/** New device rows one account may add per hour. Past it a new id isn't recorded and counts as unidentified. */
export const NEW_DEVICES_PER_HOUR = 5;

/** Devices one account may have signed in at once (not signed out). Past it a new id isn't recorded. */
export const MAX_ACTIVE_DEVICES = 20;

/** `last_seen` is written at most this often per device (every request would be a write otherwise). */
export const LAST_SEEN_EVERY_MS = 60_000;
