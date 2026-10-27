import { useSyncExternalStore } from "react";
import { getConnection, subscribeConnection } from "./connection";

/**
 * Practice mode (the on-device simulator) as features see it. Features ask this module whether
 * they're in Practice and what the Practice PIN is; they never import the simulator itself.
 */

/** The PIN the simulator accepts, shown on PIN screens in Practice. */
export const PRACTICE_PIN = "1234";

/** True while the app runs on the simulator rather than the live API. */
export function isPracticeMode() {
  return getConnection().mode === "demo";
}

/** Re-renders when the app switches between Practice and live. */
export function usePracticeMode() {
  return useSyncExternalStore(subscribeConnection, isPracticeMode, isPracticeMode);
}
