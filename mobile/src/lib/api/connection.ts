import Constants from "expo-constants";
import { Platform } from "react-native";
import { getItem, KEYS, setItem } from "../storage";

/**
 * Where the app gets its data.
 * - live: the Next.js API (`npm run dev` in the repo root, port 3000).
 * - demo: bundled sample data with simulated verification, so the app works on a phone
 *   that can't reach the dev machine, and in store review.
 * "auto" pings the API at launch and falls back to demo if it can't be reached.
 */
export type ConnectionPref = "auto" | "live" | "demo";
export type Mode = "live" | "demo";

export interface ConnectionState {
  pref: ConnectionPref;
  mode: Mode;
  baseUrl: string;
  checked: boolean;
  lastError: string | null;
}

const API_PORT = 3000;

/** EXPO_PUBLIC_API_URL wins; otherwise the dev machine Metro is served from, on port 3000. */
export function defaultBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (Platform.OS === "web") return `http://localhost:${API_PORT}`;
  const hostUri = Constants.expoConfig?.hostUri ?? "";
  const host = hostUri.split(":")[0];
  if (host) return `http://${host}:${API_PORT}`;
  return `http://localhost:${API_PORT}`;
}

let state: ConnectionState = {
  pref: "auto",
  mode: "demo",
  baseUrl: defaultBaseUrl(),
  checked: false,
  lastError: null,
};
const listeners = new Set<() => void>();

export function getConnection() {
  return state;
}

export function subscribeConnection(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function update(next: Partial<ConnectionState>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}

async function ping(baseUrl: string, timeoutMs = 3500): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/v1/me`, { signal: ctrl.signal });
    if (!res.ok) return `The API answered ${res.status}`;
    return null;
  } catch (e) {
    return (e as Error)?.name === "AbortError" ? "The API didn't answer in time" : "Couldn't reach the API";
  } finally {
    clearTimeout(timer);
  }
}

/** Reads the saved preference and decides the mode. Safe to call more than once. */
export async function initConnection() {
  const saved = await getItem(KEYS.connection);
  let pref: ConnectionPref = "auto";
  let baseUrl = defaultBaseUrl();
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as { pref?: ConnectionPref; baseUrl?: string };
      if (parsed.pref) pref = parsed.pref;
      if (parsed.baseUrl) baseUrl = parsed.baseUrl;
    } catch {
      // ignore a corrupt value
    }
  }
  await applyConnection(pref, baseUrl);
}

/** Bumped by every applyConnection, so a slow check never overwrites a newer choice. */
let applySeq = 0;

export async function applyConnection(pref: ConnectionPref, baseUrl = state.baseUrl) {
  const seq = ++applySeq;
  // Keep the app mounted while re-checking; only the very first check gates the UI.
  update({ pref, baseUrl });
  await setItem(KEYS.connection, JSON.stringify({ pref, baseUrl }));
  if (seq !== applySeq) return;
  if (pref === "demo") {
    update({ mode: "demo", checked: true, lastError: null });
    return;
  }
  const err = await ping(baseUrl);
  // A newer call started while this one waited for the server; its result is the one that counts.
  if (seq !== applySeq) return;
  if (err === null) update({ mode: "live", checked: true, lastError: null });
  else update({ mode: pref === "live" ? "live" : "demo", checked: true, lastError: err });
}
