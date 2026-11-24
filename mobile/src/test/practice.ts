/**
 * Helpers for tests that drive the Practice simulator (lib/api/demo). Never imported by the app.
 *
 * Practice calls pause with wait() to feel like a server; under Jest's fake timers `settle()` runs
 * those pauses at once and hands back the outcome, so a test can check a refusal's code without
 * try/catch.
 */
import { ApiError } from "@/lib/api/errors";

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** Runs a Practice call to the end under fake timers (`jest.useFakeTimers()` in the test). */
export async function settle<T>(call: Promise<T>): Promise<Outcome<T>> {
  const out = call.then(
    (value): Outcome<T> => ({ ok: true, value }),
    (error: unknown): Outcome<T> => ({ ok: false, error }),
  );
  await jest.advanceTimersByTimeAsync(5_000);
  return out;
}

/** The refusal's machine-readable code and status ("ok" when the call went through). */
export function codeOf(o: Outcome<unknown>): string {
  if (o.ok) return "ok";
  return o.error instanceof ApiError ? (o.error.code ?? `http_${o.error.status}`) : `thrown: ${String(o.error)}`;
}
