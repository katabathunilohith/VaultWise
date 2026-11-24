import { useSyncExternalStore } from "react";
import { getConnection, subscribeConnection } from "./connection";

/**
 * Practice mode (the on-device simulator) as features see it. Features ask this module whether
 * they're in Practice and what the Practice MPIN is; they never import the simulator itself.
 */

/** Loads the Practice data saved on this device. The root layout runs it once, before the connection check. */
export { restorePracticeData } from "./demo/persist";

/** The Practice MPIN: the simulator's MPIN until it's changed, shown on MPIN screens in Practice. */
export const PRACTICE_PIN = "246810";

/** True while the app runs on the simulator rather than the live API. */
export function isPracticeMode() {
  return getConnection().mode === "demo";
}

/** Re-renders when the app switches between Practice and live. */
export function usePracticeMode() {
  return useSyncExternalStore(subscribeConnection, isPracticeMode, isPracticeMode);
}
