import { useSyncExternalStore } from "react";
import { getHapticLevel, subscribeHaptics } from "./engine";

export { backend, createHold, getHapticLevel, haptic, initHaptics, previewHaptic, setHapticLevel, type HapticLevel } from "./engine";
export { TOKENS, type TokenName } from "./tokens";

export function useHapticLevel() {
  return useSyncExternalStore(subscribeHaptics, getHapticLevel, getHapticLevel);
}
