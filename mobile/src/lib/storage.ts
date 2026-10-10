import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Small key-value store. Native builds use the Keychain / Keystore through
 * expo-secure-store; the web preview falls back to localStorage, which can be
 * missing or throw (private windows), so every call is guarded.
 */
const web = Platform.OS === "web";

async function rawGet(key: string): Promise<string | null> {
  try {
    if (web) return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function rawSet(key: string, value: string): Promise<void> {
  try {
    if (web) globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Storage is a convenience here; the app works without it.
  }
}

async function rawRemove(key: string): Promise<void> {
  try {
    if (web) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}

/* ---------- per-item keys ---------- */

/**
 * Some keys are made one per item: a vault's last seen milestone ("vw.milestone.<vaultId>") and
 * each support message ("vw.cases.<caseId>"). The Keychain can't list its keys, so keys under
 * these prefixes are also written to an index, and removeItemKeys() can find them all again.
 */
const ITEM_PREFIXES = ["vw.milestone.", "vw.cases."];
const INDEX_KEY = "vw.itemKeys";
const isItemKey = (key: string) => ITEM_PREFIXES.some((p) => key.startsWith(p));

let indexed: Set<string> | null = null;
let indexQueue: Promise<void> = Promise.resolve();

async function readIndex(): Promise<Set<string>> {
  try {
    const parsed: unknown = JSON.parse((await rawGet(INDEX_KEY)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string" && isItemKey(k)) : []);
  } catch {
    return new Set();
  }
}

/** Index changes run one at a time, so two writes can't drop each other's keys. */
function withIndex(change: (keys: Set<string>) => boolean | Promise<boolean>): Promise<void> {
  const run = indexQueue.then(async () => {
    indexed ??= await readIndex();
    if (await change(indexed)) await rawSet(INDEX_KEY, JSON.stringify([...indexed]));
  });
  indexQueue = run.catch(() => undefined);
  return indexQueue;
}

export function getItem(key: string): Promise<string | null> {
  return rawGet(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  await rawSet(key, value);
  if (isItemKey(key))
    await withIndex((keys) => {
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
}

export async function removeItem(key: string): Promise<void> {
  await rawRemove(key);
  if (isItemKey(key)) await withIndex((keys) => keys.delete(key));
}

/** Removes every per-item key this device has written (milestones, support messages). */
export function removeItemKeys(): Promise<void> {
  return withIndex(async (keys) => {
    await Promise.all([...keys].map(rawRemove));
    keys.clear();
    await rawRemove(INDEX_KEY);
    return false;
  });
}

/** The key a support message is kept under (features/assistant/support/cases.ts). */
export const caseMessageKey = (caseId: string) => `vw.cases.${caseId}`;

export const KEYS = {
  connection: "vw.connection",
  haptics: "vw.haptics",
  appLock: "vw.appLock",
  devicePin: "vw.devicePin",
  theme: "vw.theme",
  onboardedLocally: "vw.onboarded",
  /** The list of support cases (without their messages). */
  cases: "vw.cases",
} as const;
