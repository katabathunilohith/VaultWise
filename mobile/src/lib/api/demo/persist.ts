import { AppState } from "react-native";
import { getBulkItem, getSecureChunked, onDeviceReset, removeBulkItem, removeSecureChunked, setBulkItem, setSecureChunked } from "../../storage";

/**
 * Saves Practice data on the device, so vaults, withdrawals, the wallet and checkouts survive closing
 * the app or reloading the page.
 *
 * Each part of the simulator registers a slice: how to copy its memory, put a copy back, and reset it.
 * This module only stores and loads slices; it never knows what they hold, so a new part of the
 * simulator saves itself by registering, without changing this file.
 *
 * protection (baseline finding N5): the bulk save is plain AsyncStorage, so a slice holding personal
 * details or a PIN says `sensitive: true` and is kept on its own in secure storage instead
 * (`vw.practice.<key>`, the Keychain / Keystore, split into chunks by lib/storage.ts so a slice over
 * one entry's ~2 KB still saves; keep those slices small all the same). A sensitive write that fails
 * is tried again at the next save. Saves from before that still load: a sensitive slice found in the
 * bulk save is read from there once, then moves.
 */
export interface PracticeSlice<T = unknown> {
  /** Unique name inside the save. */
  key: string;
  /** protection: personal details or a PIN. Kept in secure storage, not the bulk save. Keep it small. */
  sensitive?: boolean;
  /** A JSON-safe copy of this part's memory. */
  save(): T;
  /** Puts a saved copy back. Throw if it doesn't fit: every slice then starts over from the sample data. */
  load(saved: T): void;
  /** Back to the sample data. */
  reset(): void;
}

const STORAGE_KEY = "vw.bulk.practice";
/** protection: where a sensitive slice is kept (secure storage; indexed, so Delete account wipes it). */
const sensitiveKey = (slice: string) => `vw.practice.${slice}`;
/** Bump when a slice's saved shape changes in a way its load() can't handle; older saves are then dropped. */
const FORMAT = 1;
const SAVE_AFTER_MS = 500;

const slices = new Map<string, PracticeSlice>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** The last thing written, so an unchanged state isn't written again. */
let lastSaved: string | null = null;
/** protection: the same for each sensitive slice, recorded only once its write has worked. */
const lastSensitive = new Map<string, string>();
/** protection: a sensitive write still on its way, so the same value isn't queued twice. */
const pendingSensitive = new Map<string, string>();
let watchingAppState = false;

export function registerPracticeSlice<T>(slice: PracticeSlice<T>) {
  slices.set(slice.key, slice as PracticeSlice);
}

/** Every slice back to the sample data (Practice "Start over" and Delete account). The next save records it. */
export function resetPracticeSlices() {
  for (const slice of slices.values()) slice.reset();
}

function snapshot() {
  const saved: Record<string, unknown> = {};
  for (const [key, slice] of slices) if (!slice.sensitive) saved[key] = slice.save();
  return JSON.stringify({ format: FORMAT, slices: saved });
}

/**
 * protection: each sensitive slice on its own, in the same { format } envelope. Only a write that
 * worked counts as saved; after a failed one the next save writes it again.
 */
function writeSensitive() {
  for (const [key, slice] of slices) {
    if (!slice.sensitive) continue;
    const next = JSON.stringify({ format: FORMAT, data: slice.save() });
    if ((pendingSensitive.get(key) ?? lastSensitive.get(key)) === next) continue;
    pendingSensitive.set(key, next);
    void setSecureChunked(sensitiveKey(key), next).then((ok) => {
      if (ok) lastSensitive.set(key, next);
      if (pendingSensitive.get(key) === next) pendingSensitive.delete(key);
    });
  }
}

function writeNow() {
  if (timer) clearTimeout(timer);
  timer = null;
  writeSensitive(); // protection
  const next = snapshot();
  if (next === lastSaved) return;
  lastSaved = next;
  void setBulkItem(STORAGE_KEY, next);
}

/** protection: a sensitive slice's own save, if there is one. Throws for one from another version. */
function readSensitive(raw: string | null): { found: boolean; data?: unknown } {
  if (!raw) return { found: false };
  const saved = JSON.parse(raw) as { format?: number; data?: unknown };
  if (saved.format !== FORMAT) throw new Error("This save is from an older version");
  return { found: true, data: saved.data };
}

/** Saves shortly after a change, so a burst of changes is written once. */
export function savePracticeSoon() {
  timer ??= setTimeout(writeNow, SAVE_AFTER_MS);
}

/**
 * Loads the saved Practice data, if there is any. Run once at start-up, before Practice answers its
 * first request, so screens never show the sample data first.
 */
export async function restorePracticeData() {
  if (!watchingAppState) {
    watchingAppState = true;
    // Write straight away when the app goes to the background, in case it's closed before the timer fires.
    AppState.addEventListener("change", (s) => {
      if (s !== "active" && timer) writeNow();
    });
  }
  const sensitiveKeys = [...slices.values()].filter((s) => s.sensitive).map((s) => s.key);
  const [raw, ...secure] = await Promise.all([getBulkItem(STORAGE_KEY), ...sensitiveKeys.map((k) => getSecureChunked(sensitiveKey(k)))]);
  const secureRaw = new Map(sensitiveKeys.map((k, i) => [k, secure[i]]));
  if (!raw && secure.every((v) => !v)) return;
  try {
    const saved = raw ? (JSON.parse(raw) as { format?: number; slices?: Record<string, unknown> }) : { format: FORMAT, slices: {} };
    if (saved.format !== FORMAT || !saved.slices) throw new Error("This save is from an older version");
    // In registration order, so a slice can build on the ones before it.
    for (const [key, slice] of slices) {
      // protection: a sensitive slice comes from secure storage; an older save may still have it in bulk.
      const own = slice.sensitive ? readSensitive(secureRaw.get(key) ?? null) : { found: false };
      if (own.found) {
        slice.load(own.data);
        lastSensitive.set(key, secureRaw.get(key)!);
      } else if (key in saved.slices) slice.load(saved.slices[key]);
    }
    if (raw) lastSaved = raw;
    // protection: write anything that changed shape, so an older save's personal details and MPIN
    // move out of the bulk save now (nothing is written when the save is already current).
    writeNow();
  } catch {
    // An older or damaged save: start from the sample data rather than crash on it.
    resetPracticeSlices();
    await removeBulkItem(STORAGE_KEY);
    await Promise.all(sensitiveKeys.map((k) => removeSecureChunked(sensitiveKey(k)))); // protection
    lastSensitive.clear();
    pendingSensitive.clear();
  }
}

/**
 * Wraps the simulator so every call is followed by a save. Reads count too: they settle checks and
 * payments that finished in the background. Each call keeps its own return value, sync or async.
 */
export function savingAfterEachCall<T extends object>(api: T): T {
  const wrapped: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(api)) {
    if (typeof value !== "function") {
      wrapped[name] = value;
      continue;
    }
    wrapped[name] = (...args: unknown[]) => {
      const result: unknown = value.apply(api, args);
      if (result && typeof (result as Promise<unknown>).then === "function") void (result as Promise<unknown>).then(savePracticeSoon, savePracticeSoon);
      else savePracticeSoon();
      return result;
    };
  }
  return wrapped as T;
}

// Delete account: no Practice data stays on the device.
onDeviceReset(() => {
  if (timer) clearTimeout(timer);
  timer = null;
  lastSaved = null;
  void removeBulkItem(STORAGE_KEY);
  // protection: the sensitive slices' keys (and their chunks) are wiped with the rest of the vw.* keys.
  lastSensitive.clear();
  pendingSensitive.clear();
});
