import { useSyncExternalStore } from "react";
import { onDeviceReset } from "../storage";

/**
 * The device session as screens see it: app lock (./app-lock.ts), the device PIN
 * (./device-pin.ts) and one-time consents (../consents.ts). Each of those writes its own fields;
 * initSession() in lib/session.ts reads them all once at start-up.
 */
export interface SessionState {
  ready: boolean;
  lockEnabled: boolean;
  unlocked: boolean;
  hasDevicePin: boolean;
  aiConsent: boolean;
  /** "May an AI read the bills and IDs I send?" null until asked (features/ai-consent). */
  aiChecks: boolean | null;
  ageConfirmed: boolean;
}

let state: SessionState = { ready: false, lockEnabled: false, unlocked: false, hasDevicePin: false, aiConsent: false, aiChecks: null, ageConfirmed: false };
const listeners = new Set<() => void>();

export const getSession = () => state;

export function setSession(next: Partial<SessionState>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}

export function useSession() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

// Delete account: no PIN, no lock and no consents are left on the device.
onDeviceReset(() => setSession({ lockEnabled: false, unlocked: true, hasDevicePin: false, aiConsent: false, aiChecks: null, ageConfirmed: false }));
