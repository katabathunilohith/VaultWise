import { router, type Href } from "expo-router";
import { MPIN_ENABLED, MPIN_ROUTE, SHEET_OPEN_TIMEOUT_MS } from "./config";

/**
 * The imperative MPIN prompt, like ensureAiAnswer() in features/ai-consent: a money flow awaits it
 * just before its API call, and the MPIN sheet (app/mpin.tsx) answers. One ask at a time.
 *
 * - withMpin(reason, call): the sheet stays up while `call(pin)` runs, so a wrong MPIN shakes the
 *   dots and says how many tries are left, and a lock shows when it ends, without leaving the sheet.
 *   Resolves with the call's result once the sheet has closed, or null if the person cancelled.
 *   Any other failure of the call closes the sheet and is thrown to the flow.
 * - ensureMpin(reason): just collects the MPIN (resolves null if cancelled). The flow sends it and
 *   handles the answer itself (readMpinError in ./errors.ts).
 */

export type MpinRun = (pin: string) => Promise<unknown>;

export interface MpinAsk {
  /** What's being approved, e.g. "Pay ₹1,200 to City Clinic". */
  reason: string;
  /** Runs while the sheet is up (withMpin); null to just collect the MPIN (ensureMpin). */
  run: MpinRun | null;
}

export type MpinOutcome = { kind: "done"; pin: string; value: unknown } | { kind: "cancel" } | { kind: "error"; error: unknown };

let current: { ask: MpinAsk; finish: (o: MpinOutcome) => void; opened: boolean } | null = null;

/** Cast like the other module routes, so the module stands alone. */
const SHEET = MPIN_ROUTE as Href;

function open(ask: MpinAsk): Promise<MpinOutcome> {
  // A second ask while one is on screen (a double tap) is dropped, never stacked.
  if (current) return Promise.resolve({ kind: "cancel" });
  return new Promise((resolve) => {
    const entry = { ask, finish: resolve, opened: false };
    current = entry;
    router.push(SHEET);
    // The route can be missing (say the app locked meanwhile): don't leave the flow waiting forever.
    setTimeout(() => {
      if (current === entry && !entry.opened) settleMpinAsk(ask, { kind: "cancel" });
    }, SHEET_OPEN_TIMEOUT_MS);
  });
}

/** The sheet reads what it's asking for when it opens (null: nothing is waiting, so it closes). */
export function takeMpinAsk(): MpinAsk | null {
  if (!current) return null;
  current.opened = true;
  return current.ask;
}

/**
 * The sheet calls this as it closes, so the flow carries on only once it's gone. Only the ask it was
 * opened for is settled, once: a late call (a money move that finished after the sheet had gone)
 * can never answer a newer ask.
 */
export function settleMpinAsk(ask: MpinAsk | null, outcome: MpinOutcome) {
  const entry = current;
  if (!entry || !ask || entry.ask !== ask) return;
  current = null;
  entry.finish(outcome);
}

/**
 * Asks for the MPIN and runs `call` with it while the sheet stays up. Null when cancelled. With
 * the module switched off, runs `call` with no MPIN.
 */
export async function withMpin<T>(reason: string, call: (pin: string | undefined) => Promise<T>): Promise<T | null> {
  if (!MPIN_ENABLED) return call(undefined);
  const out = await open({ reason, run: call });
  if (out.kind === "cancel") return null;
  if (out.kind === "error") throw out.error;
  return out.value as T;
}

/** Collects the MPIN for the flow to send. Null when cancelled; "" with the module switched off. */
export async function ensureMpin(reason: string): Promise<string | null> {
  if (!MPIN_ENABLED) return "";
  const out = await open({ reason, run: null });
  if (out.kind === "error") throw out.error;
  return out.kind === "done" ? out.pin : null;
}
