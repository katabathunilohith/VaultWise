import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { getItem, onDeviceReset, setItem } from "@/lib/storage";
import { PEEK_MS, PROTECTION } from "./config";

/**
 * "Hide balances" on Home: a preference kept on the phone. While it's on, Home's amounts show as
 * dots; a tap on one shows them all for PEEK_MS, or until the app leaves the screen.
 *
 * The saved choice is read as the app starts (this module loads with the root layout), and until it
 * has been read the amounts count as hidden, so they never flash before the dots.
 */
const KEY = "vw.hideBalances";

/** null until the saved choice has been read (shown as hidden meanwhile). */
let hidden: boolean | null = null;
let peeking = false;
let peekTimer: ReturnType<typeof setTimeout> | null = null;
let loaded: Promise<void> | null = null;
let watching = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function stopPeek() {
  if (peekTimer) clearTimeout(peekTimer);
  peekTimer = null;
  if (!peeking) return;
  peeking = false;
  emit();
}

function load() {
  loaded ??= getItem(KEY).then((v) => {
    // A choice made (or a reset) while it was being read wins.
    if (hidden !== null) return;
    hidden = v === "1";
    emit();
  });
  if (!watching) {
    watching = true;
    // Leaving the app ends a peek, so the amounts are hidden again in the app switcher.
    AppState.addEventListener("change", (s) => s !== "active" && stopPeek());
  }
  return loaded;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  void load();
  return () => {
    listeners.delete(fn);
  };
}

const masked = () => PROTECTION.hideBalances && hidden !== false && !peeking;
const preference = () => PROTECTION.hideBalances && hidden !== false;

/** True while Home's amounts should show as dots. */
export function useBalancesMasked() {
  return useSyncExternalStore(subscribe, masked, masked);
}

/** Whether "Hide balances" is on (a peek doesn't change it). */
export function useHideBalances() {
  return useSyncExternalStore(subscribe, preference, preference);
}

export async function setHideBalances(on: boolean) {
  hidden = on;
  stopPeek();
  emit();
  await setItem(KEY, on ? "1" : "0");
}

/** Shows the hidden amounts for a short while. */
export function peekBalances() {
  if (hidden === false) return;
  if (peekTimer) clearTimeout(peekTimer);
  peekTimer = setTimeout(stopPeek, PEEK_MS);
  if (peeking) return;
  peeking = true;
  emit();
}

// Delete account and sign-out: the preference goes with the rest of the account's choices.
onDeviceReset(() => {
  hidden = false;
  stopPeek();
  loaded = Promise.resolve();
  emit();
});

// Read at launch, so the choice is known before Home shows any amount.
if (PROTECTION.hideBalances) void load();
