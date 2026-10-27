import { ZodError, type ZodType } from "zod";
import { HttpError, type User } from "./users";
import { LedgerError } from "./ledger";
import { tick } from "./scheduler";
import { AiError } from "./groq";
import { withRequest } from "./auth/context"; // identity
import { reload, requireAdmin, resolveCustomer } from "./auth/session"; // identity

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json(e.code ? { error: e.message, code: e.code } : { error: e.message }, { status: e.status });
  if (e instanceof LedgerError) return json({ error: e.message }, { status: 400 });
  if (e instanceof AiError) return json({ error: `AI is unavailable right now: ${e.message}. Please try again later.` }, { status: 503 });
  if (e instanceof ZodError) return json({ error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") }, { status: 400 });
  console.error(e);
  return json({ error: (e as Error)?.message ?? "Unexpected error" }, { status: 500 });
}

/** Wraps a route handler with uniform error handling, and makes the request's headers available to `customer()`. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A) => {
    const run = async () => {
      try {
        return await fn(...args);
      } catch (e) {
        return errorResponse(e);
      }
    };
    // identity: route handlers get the Request first; keep its headers for the sign-in check.
    return args[0] instanceof Request ? withRequest(args[0], run) : run();
  };
}

/**
 * Resolves the customer and runs the lazy scheduler first.
 * `access` says whether the route only reads ("read") or changes something ("write", the default);
 * `kyc: true` marks a route that moves money out and needs a verified ID. (Enforced by the identity module.)
 */
export async function customer(opts: { tick?: boolean; access?: "read" | "write"; kyc?: boolean; recovery?: boolean } = {}): Promise<User> {
  // identity: prototype mode resolves the first user; firebase mode the signed-in person's wallet.
  // `recovery: true` (read routes only) lets a sign-in with provisional recovery access in.
  const { user } = await resolveCustomer({ access: opts.access, kyc: opts.kyc, recovery: opts.recovery });
  if (opts.tick !== false) await tick(user);
  return reload(user);
}

/**
 * identity: admin routes. Prototype mode is open, as before, and acts as REVIEWER; firebase mode
 * needs a signed-in email from ADMIN_EMAILS and returns it as the reviewer name.
 */
export async function admin(): Promise<string> {
  return (await requireAdmin()) ?? REVIEWER;
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
