import { ZodError, type ZodType } from "zod";
import { HttpError, requireUser, type User } from "./users";
import { LedgerError } from "./ledger";
import { tick } from "./scheduler";
import { AiError } from "./groq";

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message }, { status: e.status });
  if (e instanceof LedgerError) return json({ error: e.message }, { status: 400 });
  if (e instanceof AiError) return json({ error: `AI is unavailable right now: ${e.message}. Please try again later.` }, { status: 503 });
  if (e instanceof ZodError) return json({ error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") }, { status: 400 });
  console.error(e);
  return json({ error: (e as Error)?.message ?? "Unexpected error" }, { status: 500 });
}

/** Wraps a route handler with uniform error handling. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Resolves the customer and runs the lazy scheduler first. */
export async function customer(opts: { tick?: boolean } = {}): Promise<User> {
  const user = requireUser();
  if (opts.tick !== false) await tick(user);
  return requireUser();
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body");
  }
  return schema.parse(raw);
}

/** Converts a major-unit amount from the client into integer minor units. */
export function minor(n: number) {
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, "Amount must be a positive number");
  return Math.round(n * 100);
}

export const REVIEWER = "ops.reviewer@vaultwise";
