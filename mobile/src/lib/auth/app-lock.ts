import { AppState, Linking, Platform, type AppStateStatus } from "react-native";
import { IDLE_LOCK_MS, PROTECTION } from "@/features/protection/config"; // protection
import { getItem, KEYS, removeItem, setItem } from "../storage";
import { getSession, setSession } from "./session-state";

/**
 * App lock: Face ID / fingerprint, with the device PIN as fallback, whenever the person comes
 * back to the app. Its on/off and locked/unlocked state live in the session (./session-state.ts).
 *
 * protection (plan 04): it is on by default once there is a PIN on this phone (unless the person
 * turned it off), and it also locks after IDLE_LOCK_MS without a touch while the app is open.
 */

/**
 * Whether app lock was turned on or off (read once at start-up; it also needs a device PIN).
 * null when the person never chose: then PROTECTION.lockByDefault decides.
 */
export async function readLockSetting(): Promise<boolean | null> {
  const v = await getItem(KEYS.appLock);
  return v === "1" ? true : v === "0" ? false : null;
}

export async function setLockEnabled(on: boolean) {
  await setItem(KEYS.appLock, on ? "1" : "0");
  // protection: a later turn-on (from Settings) starts again from the phone's own biometric.
  if (!on) await removeItem(BIO_UNLOCK_KEY);
  noteActivity();
  setSession({ lockEnabled: on, unlocked: true, ...(on ? {} : { biometricUnlock: true }) });
}

/**
 * protection: a PIN was just saved on this phone. If the person never chose about app lock, it
 * turns on (lockByDefault). Whoever is using the app stays in; the lock applies from the next time.
 */
export async function applyLockDefault() {
  if (!PROTECTION.lockByDefault || getSession().lockEnabled) return;
  if ((await readLockSetting()) !== null) return;
  noteActivity();
  setSession({ lockEnabled: true });
}

/* ---------- protection: Face ID / fingerprint unlock ---------- */

/**
 * "0" when Face ID / fingerprint may not unlock the app: onboarding asked for it and the check
 * didn't pass (the biometric on this phone may not be the person's). Missing means the phone's
 * biometric works as before. Cleared when app lock is turned off.
 */
const BIO_UNLOCK_KEY = "vw.bioUnlock";

export async function readBiometricUnlock() {
  if (!PROTECTION.biometricRules) return true;
  return (await getItem(BIO_UNLOCK_KEY)) !== "0";
}

export async function setBiometricUnlock(on: boolean) {
  if (on) await removeItem(BIO_UNLOCK_KEY);
  else await setItem(BIO_UNLOCK_KEY, "0");
  setSession({ biometricUnlock: on || !PROTECTION.biometricRules });
}

export function markUnlocked() {
  noteActivity();
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
 * always means the person left the app, and it locks as usual. So this count is used on Android
 * only for the background lock; the idle lock waits for it on both platforms.
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
    noteActivity(); // protection: the person was busy in the picker, camera or prompt
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

/* ---------- protection: idle lock ---------- */

/** The last touch anywhere in the app (the root layout reports them), or the last unlock. */
let lastActivity = Date.now();
/** How often the idle lock looks at the clock. */
const IDLE_CHECK_MS = 15_000;

/** The root layout calls this on every touch, so the idle lock knows the person is there. */
export function noteActivity() {
  lastActivity = Date.now();
}

function checkIdle() {
  if (!PROTECTION.idleLock) return;
  const { lockEnabled, unlocked } = getSession();
  if (!lockEnabled || !unlocked || AppState.currentState !== "active") return;
  // System UI the app opened (the camera, the photo picker) takes touches the root can't see.
  if (systemUi > 0) return noteActivity();
  if (Date.now() - lastActivity >= IDLE_LOCK_MS) lockNow();
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
    // protection: coming back counts as a touch; the background lock above already decided.
    noteActivity();
  }
}

/**
 * Locks the app when it goes to the background, and after IDLE_LOCK_MS without a touch (if app
 * lock is on). Returns the cleanup.
 */
export function watchAppLock() {
  const sub = AppState.addEventListener("change", onAppState);
  noteActivity();
  // protection: phones report touches through the root layout; the web preview's clicks and typing
  // are heard here (react-native-web doesn't pass capture-phase pointer props on).
  const doc = Platform.OS === "web" ? (globalThis as { document?: Document }).document : undefined;
  doc?.addEventListener("pointerdown", noteActivity, true);
  doc?.addEventListener("keydown", noteActivity, true);
  const idle = setInterval(checkIdle, IDLE_CHECK_MS);
  return () => {
    sub.remove();
    clearInterval(idle);
    doc?.removeEventListener("pointerdown", noteActivity, true);
    doc?.removeEventListener("keydown", noteActivity, true);
  };
}
