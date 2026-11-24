import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Small key-value store. Native builds use the Keychain / Keystore through
 * expo-secure-store; the web preview falls back to localStorage, which can be
 * missing or throw (private windows), so every call is guarded.
 *
 * protection: on iOS the Keychain outlives the app, so the first launch after a fresh install wipes
 * what an earlier install left there before anything reads it (see "fresh install" below). Every
 * exported call waits for that check.
 */
const web = Platform.OS === "web";

async function rawGetStrict(key: string): Promise<string | null> {
  if (web) return globalThis.localStorage?.getItem(key) ?? null;
  return await SecureStore.getItemAsync(key);
}

async function rawGet(key: string): Promise<string | null> {
  try {
    return await rawGetStrict(key);
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
/**
 * protection: chunked secrets whose key isn't "vw.*" (the Firebase session, `vwauth.*`). Kept apart
 * so an account wipe leaves them (Firebase removes its own on sign-out); a fresh install's wipe
 * removes them too.
 */
const OUTSIDE_KEY = "vw.chunkedKeys";
const isIndexed = (key: string) => key.startsWith("vw.") && key !== INDEX_KEY && key !== OUTSIDE_KEY;

async function readKeyList(listKey: string, accept: (key: string) => boolean): Promise<Set<string>> {
  try {
    const parsed: unknown = JSON.parse((await rawGet(listKey)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string" && accept(k)) : []);
  } catch {
    return new Set();
  }
}

/** A stored list of keys whose changes run one at a time, so two writes can't drop each other's keys. */
function keyList(listKey: string, accept: (key: string) => boolean) {
  let keys: Set<string> | null = null;
  let queue: Promise<void> = Promise.resolve();
  return (change: (keys: Set<string>) => boolean | Promise<boolean>): Promise<void> => {
    const run = queue.then(async () => {
      keys ??= await readKeyList(listKey, accept);
      if (await change(keys)) await rawSet(listKey, JSON.stringify([...keys]));
    });
    queue = run.catch(() => undefined);
    return queue;
  };
}

const withIndex = keyList(INDEX_KEY, isIndexed);
const withOutside = keyList(OUTSIDE_KEY, (k) => !isIndexed(k) && k !== INDEX_KEY && k !== OUTSIDE_KEY); // protection

export async function getItem(key: string): Promise<string | null> {
  await installReady(); // protection
  return rawGet(key);
}

/**
 * Like getItem, but a storage that fails throws instead of reading as "nothing saved", for callers
 * that must not mistake a failed read for a missing value (the install id, lib/api/device.ts).
 */
export async function getItemStrict(key: string): Promise<string | null> {
  await installReady(); // protection
  return rawGetStrict(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  await installReady(); // protection
  await rawSet(key, value);
  if (isIndexed(key))
    await withIndex((keys) => {
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
}

export async function removeItem(key: string): Promise<void> {
  await installReady(); // protection
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

/** Removes every indexed key except `keep`, each with its chunks if it holds a chunked secret, then tells the subscribers. */
async function wipeKeys(keep: readonly string[]): Promise<void> {
  const kept = new Set(keep);
  await withIndex(async (keys) => {
    // Read the case list before it goes: it's the only record of older builds' message keys.
    // On the web every key can also be listed, which catches ones written before the index existed.
    const all = new Set([...keys, ...UNINDEXED_KEYS, ...(await unindexedCaseKeys()), ...listedWebKeys()]);
    const doomed = [...all].filter((k) => !kept.has(k) && k !== INDEX_KEY && k !== OUTSIDE_KEY);
    await Promise.all(doomed.map(removeEntry)); // protection: chunked values go whole
    doomed.forEach((k) => keys.delete(k));
    return true;
  });
  resetListeners.forEach((fn) => fn());
}

/**
 * Removes every key this app has written on the device except those in `keep` (device settings
 * that outlive an account), then tells each onDeviceReset subscriber. Chunked secrets outside
 * "vw.*" (the Firebase session) stay: Firebase removes its own on sign-out.
 */
export async function wipeDeviceData({ keep = [] }: { keep?: readonly string[] } = {}): Promise<void> {
  await installReady(); // protection
  await wipeKeys(keep);
}

/* ---------- protection: a fresh install (iOS) ---------- */

/**
 * On iOS the Keychain keeps an app's items after it's deleted, so a reinstall would find the last
 * install's sign-in session (its refresh token), PIN, lock and install id. AsyncStorage goes with
 * the app, so a marker there tells a fresh install from a normal launch:
 * - "1": a normal launch.
 * - missing, and AsyncStorage holds something (the Practice save, an older build's `firebase:*`
 *   session): an upgrade from a build before the marker. Nothing is wiped.
 * - missing, and AsyncStorage is empty: a fresh install. The marker is set to "wiping" first (and
 *   read back: a marker that can't be kept must never wipe at every launch), then every Keychain
 *   item this app wrote goes, then "1". A wipe cut short runs again at the next launch.
 * Android removes the secure store with the app (and keeps it out of backups), so it never wipes.
 */
const INSTALL_MARKER = "vw.install";
let installCheck: Promise<void> | null = null;

function installReady(): Promise<void> {
  if (Platform.OS !== "ios") return Promise.resolve();
  installCheck ??= checkInstall().catch(() => undefined);
  return installCheck;
}

async function checkInstall() {
  let marker = await AsyncStorage.getItem(INSTALL_MARKER);
  if (marker === "1") return;
  if (marker === null) {
    if ((await AsyncStorage.getAllKeys()).length > 0) {
      await AsyncStorage.setItem(INSTALL_MARKER, "1");
      return;
    }
    await AsyncStorage.setItem(INSTALL_MARKER, "wiping");
    marker = await AsyncStorage.getItem(INSTALL_MARKER);
    if (marker !== "wiping") return;
  }
  await wipeKeys([]);
  await withOutside(async (keys) => {
    await Promise.all([...keys].map(removeEntry));
    keys.clear();
    return true;
  });
  await AsyncStorage.setItem(INSTALL_MARKER, "1");
}

/* ---------- bulk storage ---------- */

/**
 * For larger data that isn't secret, which the Keychain can't hold: the Practice save
 * (lib/api/demo/persist.ts). AsyncStorage on phones, localStorage on the web. It isn't encrypted, so
 * never put a PIN, token or personal detail here (secrets too big for one entry: the chunked
 * helpers below). Its owner clears it through onDeviceReset.
 */
export async function getBulkItem(key: string): Promise<string | null> {
  await installReady(); // protection
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setBulkItem(key: string, value: string): Promise<void> {
  await installReady(); // protection: nothing is written before the fresh-install check has read AsyncStorage
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable: the app keeps working, it just won't remember.
  }
}

export async function removeBulkItem(key: string): Promise<void> {
  await installReady(); // protection
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/* ---------- protection: large secrets in the secure store ---------- */

/**
 * protection (plan 04): for secrets bigger than one Keychain entry should hold (some iOS versions
 * refuse values over about 2 KB), such as the Firebase sign-in session (lib/auth/firebase.ts) and
 * the Practice save's sensitive parts (lib/api/demo/persist.ts).
 *
 * The value is split into chunks, and the head under `<key>` says where they are: `chunks:<slot>:<n>`,
 * chunk i under `<key>_<slot>.<i>`, the slot "a" or "b". A write puts the new chunks in the slot the
 * head doesn't name, switches the head last, then removes the old slot's chunks. So a write cut
 * short (the app killed midway) still reads as the old value, never a mix of the two; a failed
 * write keeps the old value too. A removal takes the head first, so one cut short reads as nothing.
 * Builds before the slots wrote `chunks:<n>` with chunk i under `<key>.<i>`: those still read, and
 * the next write moves them. Calls on the same key run one at a time.
 *
 * A "vw.*" head is in the key index, so wipeDeviceData() removes it with its chunks. Any other key
 * (the Firebase session) is listed apart: only a fresh install's wipe removes it. Use secureKeyFor()
 * for a key that isn't already made of letters, digits, ".", "-".
 */
/** 600 UTF-16 units stay under 2 KB even when every character takes 3 bytes in UTF-8. */
const CHUNK_CHARS = 600;
const CHUNKED = "chunks:";
/** More chunks than any value here needs; only bounds the clean-up of leftovers. */
const MAX_CHUNKS = 200;

type Slot = "" | "a" | "b";
interface ChunkHead {
  /** "" for the older layout (`<key>.<i>`). */
  slot: Slot;
  n: number;
}

/** A secure-store key (letters, digits, ".", "-", "_") for any text, one to one. */
export function secureKeyFor(prefix: string, raw: string) {
  return prefix + raw.replace(/[^A-Za-z0-9.-]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 256 ? `_${code.toString(16).padStart(2, "0")}` : `_u${code.toString(16).padStart(4, "0")}`;
  });
}

/** Splits text into chunks of at most CHUNK_CHARS, never through a surrogate pair. Pure. */
export function splitChunks(value: string, size = CHUNK_CHARS): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < value.length) {
    let end = Math.min(value.length, i + size);
    // Never split a surrogate pair (an emoji, say) across two chunks.
    const last = value.charCodeAt(end - 1);
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end--;
    out.push(value.slice(i, end));
    i = end;
  }
  return out;
}

/** Reads a head: `chunks:<slot>:<n>`, or `chunks:<n>` from before the slots. Null for a plain value or nothing; "damaged" otherwise. Pure. */
export function parseChunkHead(head: string | null): ChunkHead | "damaged" | null {
  if (head === null || !head.startsWith(CHUNKED)) return null;
  const m = /^(?:([ab]):)?(\d{1,4})$/.exec(head.slice(CHUNKED.length));
  return m ? { slot: (m[1] ?? "") as Slot, n: Number(m[2]) } : "damaged";
}

/** Where chunk i of a slot lives. Pure. */
export const chunkKey = (key: string, slot: Slot, i: number) => (slot ? `${key}_${slot}.${i}` : `${key}.${i}`);

async function rawSetStrict(key: string, value: string): Promise<void> {
  if (web) globalThis.localStorage?.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}

async function removeChunks(key: string, slot: Slot, from: number, to: number) {
  for (let i = from; i < to; i++) await rawRemove(chunkKey(key, slot, i));
}

/** Removes a slot's chunks from `from` on while there are any (leftovers of a write or removal cut short). */
async function removeChunkRun(key: string, slot: Slot, from: number) {
  for (let i = from; i < MAX_CHUNKS && (await rawGet(chunkKey(key, slot, i))) !== null; i++) await rawRemove(chunkKey(key, slot, i));
}

/** Removes a key, and its chunks when it holds a chunked value (head first). */
async function removeEntry(key: string) {
  const head = parseChunkHead(await rawGet(key));
  await rawRemove(key);
  if (head === null) return;
  if (head !== "damaged" && head.slot === "") await removeChunks(key, "", 0, head.n);
  await removeChunkRun(key, "a", 0);
  await removeChunkRun(key, "b", 0);
}

/** Records (or forgets) a chunked key in the index it belongs to. */
function noteChunked(key: string, present: boolean) {
  const list = isIndexed(key) ? withIndex : withOutside;
  return list((keys) => {
    if (!present) return keys.delete(key);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

const chunkQueues = new Map<string, Promise<unknown>>();

/** Runs calls on one chunked key one at a time. */
function onKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const before = chunkQueues.get(key) ?? Promise.resolve();
  const run = before.then(fn, fn);
  const tail = run.catch(() => undefined);
  chunkQueues.set(key, tail);
  void tail.then(() => {
    if (chunkQueues.get(key) === tail) chunkQueues.delete(key);
  });
  return run;
}

export function getSecureChunked(key: string): Promise<string | null> {
  return onKey(key, async () => {
    await installReady();
    const raw = await rawGet(key);
    const head = parseChunkHead(raw);
    if (head === null) return raw;
    if (head === "damaged") return null;
    const parts = await Promise.all(Array.from({ length: head.n }, (_, i) => rawGet(chunkKey(key, head.slot, i))));
    // A missing chunk means a damaged value: better none than half of one.
    return parts.every((p): p is string => p !== null) ? parts.join("") : null;
  });
}

/** Saves a secret of any size. Resolves false when it couldn't be saved (the old value, if any, is still there). */
export function setSecureChunked(key: string, value: string): Promise<boolean> {
  return onKey(key, async () => {
    await installReady();
    const parts = splitChunks(value);
    const head = parseChunkHead(await rawGet(key));
    const old = head === "damaged" ? null : head;
    const slot: Slot = old?.slot === "a" ? "b" : "a";
    try {
      for (let i = 0; i < parts.length; i++) await rawSetStrict(chunkKey(key, slot, i), parts[i]);
      // The switch: until this line the head still names the old chunks.
      await rawSetStrict(key, `${CHUNKED}${slot}:${parts.length}`);
    } catch {
      await removeChunkRun(key, slot, 0);
      return false;
    }
    if (old) await removeChunks(key, old.slot, 0, old.n);
    await removeChunkRun(key, slot, parts.length);
    await noteChunked(key, true);
    return true;
  });
}

export function removeSecureChunked(key: string): Promise<void> {
  return onKey(key, async () => {
    await installReady();
    await removeEntry(key);
    await noteChunked(key, false);
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
  /** devices: this install's id (lib/api/device.ts). Kept through a normal sign-out (lib/session.ts resetDevice). */
  deviceId: "vw.deviceId",
} as const;
