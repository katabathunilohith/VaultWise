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

/** Every "vw.*" key the web preview holds (localStorage can be listed; the Keychain can't). */
function listedWebKeys(): string[] {
  if (!web) return [];
  try {
    const ls = globalThis.localStorage;
    if (!ls) return [];
    return Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter((k): k is string => !!k && k.startsWith("vw."));
  } catch {
    return [];
  }
}

/* ---------- key index ---------- */

/**
 * The Keychain can't list its keys, so every "vw.*" key written here is also recorded in this
 * index, and wipeDeviceData() can find them all again. That includes keys made one per item: a
 * vault's last seen milestone ("vw.milestone.<vaultId>") and each support message ("vw.cases.<caseId>").
 * The name dates from when only those per-item keys were indexed.
 */
const INDEX_KEY = "vw.itemKeys";
const isIndexed = (key: string) => key.startsWith("vw.") && key !== INDEX_KEY;

let indexed: Set<string> | null = null;
let indexQueue: Promise<void> = Promise.resolve();

async function readIndex(): Promise<Set<string>> {
  try {
    const parsed: unknown = JSON.parse((await rawGet(INDEX_KEY)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string" && isIndexed(k)) : []);
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
  if (isIndexed(key))
    await withIndex((keys) => {
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
}

export async function removeItem(key: string): Promise<void> {
  await rawRemove(key);
  if (isIndexed(key)) await withIndex((keys) => keys.delete(key));
}

/* ---------- device reset ---------- */

/**
 * Fixed keys that builds from before the full index wrote without listing them. Frozen: every
 * key written now is indexed, so a new key never needs adding here.
 */
const UNINDEXED_KEYS = [
  "vw.appLock",
  "vw.devicePin",
  "vw.consents",
  "vw.cases",
  "vw.aiReports",
  "vw.aiTone",
  "vw.pinAttempts",
  "vw.notifications",
  "vw.home.moves",
  "vw.home.freshStart",
];

/** Support messages from builds that kept no index at all, found only through the case list. */
async function unindexedCaseKeys(): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse((await rawGet(KEYS.cases)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((c: unknown) =>
      c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string" ? [caseMessageKey((c as { id: string }).id)] : [],
    );
  } catch {
    return [];
  }
}

const resetListeners = new Set<() => void>();

/**
 * Runs fn after wipeDeviceData() has cleared the device, so a store can drop what it holds in
 * memory. Subscribe once, at module level. Returns the unsubscribe.
 */
export function onDeviceReset(fn: () => void): () => void {
  resetListeners.add(fn);
  return () => {
    resetListeners.delete(fn);
  };
}

/**
 * Removes every key this app has written on the device except those in `keep` (device settings
 * that outlive an account), then tells each onDeviceReset subscriber.
 */
export async function wipeDeviceData({ keep = [] }: { keep?: readonly string[] } = {}): Promise<void> {
  const kept = new Set(keep);
  await withIndex(async (keys) => {
    // Read the case list before it goes: it's the only record of older builds' message keys.
    // On the web every key can also be listed, which catches ones written before the index existed.
    const all = new Set([...keys, ...UNINDEXED_KEYS, ...(await unindexedCaseKeys()), ...listedWebKeys()]);
    const doomed = [...all].filter((k) => !kept.has(k) && k !== INDEX_KEY);
    await Promise.all(doomed.map(rawRemove));
    doomed.forEach((k) => keys.delete(k));
    return true;
  });
  resetListeners.forEach((fn) => fn());
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
