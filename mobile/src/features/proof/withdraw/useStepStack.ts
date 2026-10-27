import { useCallback, useState } from "react";

/**
 * Steps on a stack, so Back always returns to where you were. Only the top step shows.
 * - go: push a step; back: pop one (never the first); swap: replace the top; reset: start over at a step.
 */
export function useStepStack<S>(first: () => S) {
  const [stack, setStack] = useState<S[]>(() => [first()]);
  const go = useCallback((s: S) => setStack((st) => [...st, s]), []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const swap = useCallback((s: S) => setStack((st) => [...st.slice(0, -1), s]), []);
  const reset = useCallback((s: S) => setStack([s]), []);
  return { step: stack[stack.length - 1], depth: stack.length, go, back, swap, reset };
}
