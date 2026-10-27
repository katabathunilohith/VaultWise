import { AppState, Linking, Platform, type AppStateStatus } from "react-native";
import { getItem, KEYS, setItem } from "../storage";
import { getSession, setSession } from "./session-state";

/**
 * App lock: Face ID / fingerprint, with the device PIN as fallback, whenever the person comes
 * back to the app. Its on/off and locked/unlocked state live in the session (./session-state.ts).
 */

/** Whether app lock was turned on (read once at start-up; it also needs a device PIN). */
export async function readLockSetting() {
  return (await getItem(KEYS.appLock)) === "1";
}

export async function setLockEnabled(on: boolean) {
  await setItem(KEYS.appLock, on ? "1" : "0");
  setSession({ lockEnabled: on, unlocked: true });
}

export function markUnlocked() {
  setSession({ unlocked: true });
}

export function lockNow() {
  if (getSession().lockEnabled) setSession({ unlocked: false });
}

/* ---------- when to lock ---------- */

/**
 * System UI the app opens itself: the photo picker, the system camera, a permission prompt,
 * Face ID or the fingerprint sheet. On Android each of these can send the app to the background,
 * which would lock it and close the flow the person is in the middle of (a withdrawal, a receipt,
 * a payment). While one is open there, going to the background doesn't lock.
 *
 * iOS keeps the app active (or inactive) for all of these, so a trip to the background there
 * always means the person left the app, and it locks as usual. So this count is used on Android only.
 */
let systemUi = 0;
/** When the app last sent the person to its page in Settings (that call returns straight away). */
let settingsAt = 0;
/** When the lock was held off because the app went to the background for its own system UI. */
let heldSince: number | null = null;
/** A trip to Settings starts within this long of the tap. */
const SETTINGS_WINDOW_MS = 5_000;
/**
 * Long enough to pick a photo, take one or change a permission. Away for longer (someone left
 * from the picker, say), the app locks when the person is back.
 */
const HOLD_LIMIT_MS = 90_000;

/** Runs fn while system UI the app opened is on screen, so the app lock waits for it (Android). */
export async function withSystemUi<T>(fn: () => Promise<T>): Promise<T> {
  systemUi++;
  try {
    return await fn();
  } finally {
    systemUi--;
  }
}

/** Opens Vaultwise's page in the phone's Settings without locking the app on the way out. */
export async function openAppSettings() {
  settingsAt = Date.now();
  try {
    await Linking.openSettings();
  } catch {
    settingsAt = 0;
  }
}

function onAppState(next: AppStateStatus) {
  // iOS reports system sheets (permission prompts, Face ID) as "inactive", which never locks.
  if (next === "background") {
    const { lockEnabled, unlocked } = getSession();
    if (!lockEnabled || !unlocked) return;
    // A trip to Settings leaves the app on both platforms; system UI only does on Android.
    const ownSystemUi = Platform.OS === "android" && systemUi > 0;
    if (ownSystemUi || Date.now() - settingsAt < SETTINGS_WINDOW_MS) {
      heldSince ??= Date.now();
      return;
    }
    lockNow();
  } else if (next === "active") {
    const held = heldSince;
    heldSince = null;
    settingsAt = 0;
    if (held !== null && Date.now() - held > HOLD_LIMIT_MS) lockNow();
  }
}

/** Locks the app when it goes to the background (if app lock is on). Returns the cleanup. */
export function watchAppLock() {
  const sub = AppState.addEventListener("change", onAppState);
  return () => sub.remove();
}
