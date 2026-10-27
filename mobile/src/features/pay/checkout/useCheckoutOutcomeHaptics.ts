import { useEffect, useEffectEvent, useRef } from "react";
import type { IntentStatus } from "@/lib/api/pay-types";
import { haptic } from "@/lib/haptics";
import { outcomeOf } from "./outcome-table";

/**
 * Plays each outcome's haptic once, and only for a payment confirmed on this screen (not when
 * reopening an old one). `onOutcome` runs alongside, since balances may have changed.
 */
export function useCheckoutOutcomeHaptics(status: IntentStatus | undefined, paidHere: boolean, onOutcome: () => void) {
  const signalled = useRef<IntentStatus | null>(null);
  const reached = useEffectEvent(onOutcome);
  useEffect(() => {
    if (!paidHere || !status || signalled.current === status) return;
    const token = outcomeOf(status).haptic;
    if (!token) return;
    haptic(token);
    signalled.current = status;
    reached();
  }, [paidHere, status]);
}
