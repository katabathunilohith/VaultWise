import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import { AppState, Linking, Platform, type AppStateStatus } from "react-native";
import { useSyncExternalStore } from "react";
import { caseMessageKey, getItem, KEYS, removeItem, removeItemKeys, setItem } from "./storage";

/**
 * Device-level session: app lock (Face ID / fingerprint with the in-app PIN as fallback), and
 * one-time consents. The PIN never leaves the device; only a salted SHA-256 is stored in the
 * Keychain/Keystore. The server keeps its own PIN for Tier 2 emergency releases.
 */
interface SessionState {
  ready: boolean;
  lockEnabled: boolean;
  unlocked: boolean;
  hasDevicePin: boolean;
  aiConsent: boolean;
  ageConfirmed: boolean;
}

let state: SessionState = { ready: false, lockEnabled: false, unlocked: false, hasDevicePin: false, aiConsent: false, ageConfirmed: false };
const listeners = new Set<() => void>();
const set = (next: Partial<SessionState>) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};

export function useSession() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

export async function initSession() {
  const [lock, pin, consent] = await Promise.all([getItem(KEYS.appLock), getItem(KEYS.devicePin), getItem("vw.consents")]);
  let consents: { ai?: boolean; age?: boolean } = {};
  try {
    consents = consent ? JSON.parse(consent) : {};
  } catch {
    consents = {};
  }
  set({ ready: true, lockEnabled: lock === "1" && !!pin, unlocked: !(lock === "1" && !!pin), hasDevicePin: !!pin, aiConsent: !!consents.ai, ageConfirmed: !!consents.age });
}

async function hash(pin: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function setDevicePin(pin: string) {
  const salt = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
  await setItem(KEYS.devicePin, `${salt}:${await hash(pin, salt)}`);
  set({ hasDevicePin: true });
}

export async function checkDevicePin(pin: string) {
  const stored = await getItem(KEYS.devicePin);
  if (!stored) return false;
  const [salt, h] = stored.split(":");
  return (await hash(pin, salt)) === h;
}

export async function setLockEnabled(on: boolean) {
  await setItem(KEYS.appLock, on ? "1" : "0");
  set({ lockEnabled: on, unlocked: true });
}

export function markUnlocked() {
  set({ unlocked: true });
}

export function lockNow() {
  if (state.lockEnabled) set({ unlocked: false });
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
    if (!state.lockEnabled || !state.unlocked) return;
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

async function saveConsents(next: { ai?: boolean; age?: boolean }) {
  const merged = { ai: state.aiConsent, age: state.ageConfirmed, ...next };
  await setItem("vw.consents", JSON.stringify(merged));
  set({ aiConsent: !!merged.ai, ageConfirmed: !!merged.age });
}

export const giveAiConsent = () => saveConsents({ ai: true });
export const withdrawAiConsent = () => saveConsents({ ai: false });
export const confirmAge = () => saveConsents({ age: true });

/** Keys other areas keep on the device; cleared on Delete account or reset. */
const AREA_KEYS = [KEYS.cases, "vw.aiReports", "vw.aiTone", "vw.pinAttempts", "vw.notifications", "vw.home.moves", "vw.home.freshStart"];

/** Support cases listed on the device. Each message sits under its own key, found only through this list. */
async function caseIds(): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse((await getItem(KEYS.cases)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((c: unknown) => (c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string" ? [(c as { id: string }).id] : []));
  } catch {
    return [];
  }
}

export async function resetDevice() {
  // Read the case list before it goes: older installs kept no other record of the message keys.
  const cases = await caseIds();
  await Promise.all([
    removeItem(KEYS.appLock),
    removeItem(KEYS.devicePin),
    removeItem("vw.consents"),
    ...AREA_KEYS.map(removeItem),
    ...cases.map((id) => removeItem(caseMessageKey(id))),
    // Every milestone flag and support message written since the index began.
    removeItemKeys(),
  ]);
  set({ lockEnabled: false, unlocked: true, hasDevicePin: false, aiConsent: false, ageConfirmed: false });
}

/** Which biometric the device offers, if any (none on web, and in Expo Go Face ID needs a dev build). */
export async function biometricKind(): Promise<"face" | "finger" | null> {
  if (Platform.OS === "web") return null;
  try {
    const [has, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    if (!has || !enrolled) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "finger";
    return null;
  } catch {
    return null;
  }
}

export async function authenticateBiometric(reason: string) {
  try {
    const r = await withSystemUi(() => LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: "Use PIN", disableDeviceFallback: true }));
    return r.success;
  } catch {
    return false;
  }
}
