/**
 * Home's on-device preferences: "Pause all auto-saves", per-occurrence skips, and the
 * dismissed fresh-start card. There's no server endpoint for these yet, so they live on this
 * phone (Keychain/Keystore, localStorage on web) and the screens say so.
 */
import { useEffect, useSyncExternalStore } from "react";
import { getItem, setItem } from "@/lib/storage";

const KEY_MOVES = "vw.home.moves";
const KEY_FRESH = "vw.home.freshStart";

export interface HomePrefs {
  loaded: boolean;
  paused: boolean;
  /** Skipped occurrence key → when the skip can be forgotten (ms). */
  skipped: Record<string, number>;
  /** Month key ("2026-11") whose fresh-start card was dismissed or acted on. */
  freshStartDone: string | null;
}

let state: HomePrefs = { loaded: false, paused: false, skipped: {}, freshStartDone: null };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function emit(next: Partial<HomePrefs>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}

function prune(skipped: Record<string, number>, now: number) {
  return Object.fromEntries(Object.entries(skipped).filter(([, until]) => typeof until === "number" && until > now));
}

function persistMoves() {
  // Small on purpose: secure storage can reject values over ~2 KB on some iOS versions.
  void setItem(KEY_MOVES, JSON.stringify({ p: state.paused ? 1 : 0, s: state.skipped }));
}

export function loadHomePrefs() {
  if (!loading) {
    loading = (async () => {
      const [moves, fresh] = await Promise.all([getItem(KEY_MOVES), getItem(KEY_FRESH)]);
      let paused = false;
      let skipped: Record<string, number> = {};
      try {
        const parsed = moves ? (JSON.parse(moves) as { p?: number; s?: Record<string, number> }) : {};
        paused = parsed.p === 1;
        skipped = prune(parsed.s ?? {}, Date.now());
      } catch {
        // A corrupt value just means nothing is skipped.
      }
      emit({ loaded: true, paused, skipped, freshStartDone: fresh });
    })();
  }
  return loading;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const snapshot = () => state;

export function useHomePrefs() {
  useEffect(() => {
    void loadHomePrefs();
  }, []);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function setAutoSavesPaused(paused: boolean) {
  emit({ paused });
  persistMoves();
}

export function setSkipped(key: string, skip: boolean, until: number) {
  const next = prune({ ...state.skipped }, Date.now());
  if (skip) next[key] = until;
  else delete next[key];
  emit({ skipped: next });
  persistMoves();
}

export function markFreshStartDone(month: string) {
  emit({ freshStartDone: month });
  void setItem(KEY_FRESH, month);
}
