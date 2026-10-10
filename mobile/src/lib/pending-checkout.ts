import { useSyncExternalStore } from "react";

/**
 * A merchant link (vaultwise://pay/<intentId>) that arrived before the app could open it: while
 * it was locked, during onboarding, or on a cold start. +native-intent keeps the id here, and the
 * root layout opens the checkout once the person is in the app. Only the latest link is kept.
 */
let pending: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function setPendingCheckout(intentId: string) {
  pending = intentId;
  emit();
}

/** Returns the waiting intent id (if any) and clears it, so it opens once. */
export function takePendingCheckout(): string | null {
  const id = pending;
  if (id === null) return null;
  pending = null;
  emit();
  return id;
}

export function usePendingCheckout(): string | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => pending,
    () => pending,
  );
}
