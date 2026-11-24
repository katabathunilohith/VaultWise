import crypto from "node:crypto";
import { z, ZodError, type ZodType } from "zod";
import { HttpError, type User } from "./users";
import { LedgerError } from "./ledger";
import { tick } from "./scheduler";
import { AiError } from "./groq";
import { clientIp, withRequest } from "./auth/context"; // identity
import { assertKycGate, reload, requireAdmin, resolveCustomer } from "./auth/session"; // identity
import { moneyPolicy, type MoneyAction } from "./money-routes"; // mpin
import { checkRateLimit, generalLimitPerMinute } from "./rate-limit"; // rate-limit

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

/** What an unexpected error tells the client. The details go to the server log only, under the same errorId. */
export const SERVER_ERROR = "Something went wrong. Try again.";

function errorResponse(e: unknown) {
  if (e instanceof HttpError) {
    // Errors that carry extra facts (MpinError: triesLeft, lockedUntil, reason) send them alongside error and code.
    const extra = (e as HttpError & { extra?: Record<string, unknown> }).extra ?? {};
    // rate-limit: a 429 that knows when its window ends (RateLimitError) says so in Retry-After.
    const retryAfter = (e as HttpError & { retryAfterSeconds?: unknown }).retryAfterSeconds;
    const headers = e.status === 429 && typeof retryAfter === "number" && retryAfter > 0 ? { "Retry-After": String(Math.ceil(retryAfter)) } : undefined;
    return json({ ...extra, error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status, headers });
  }
  if (e instanceof LedgerError) return json({ error: e.message }, { status: 400 });
  if (e instanceof AiError) return json({ error: `AI is unavailable right now: ${e.message}. Please try again later.` }, { status: 503 });
  if (e instanceof ZodError) return json({ error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") }, { status: 400 });
  // Anything else is a bug or a broken dependency (SQLite, the disk, ...). Its text can describe the server's
  // insides, so the client gets a plain sentence and an id to quote; the log gets everything under that id.
  const errorId = crypto.randomBytes(8).toString("hex");
  console.error(`[vaultwise] server_error ${errorId}:`, e);
  return json({ error: SERVER_ERROR, code: "server_error", errorId }, { status: 500 });
}

/**
 * rate-limit: the general limit per client IP, for every route (signed in or not). Only when the IP is known,
 * which needs a trusted proxy (clientIp() in auth/context.ts); the per-person limit is in session() (lib/auth/session.ts), which customer(), admin() and GET /me all go through.
 * Runs before the route, so never inside a transaction.
 */
function limitClient(h: Headers) {
  const ip = clientIp(h);
  if (ip) checkRateLimit(`all:ip:${ip}`, generalLimitPerMinute(), 60_000);
}

/**
 * rate-limit: the same general limit per reviewer. The per-customer limit is applied by session()
 * (lib/auth/session.ts), so it covers customer() and GET /me alike, before the device is recorded.
 */
function limitReviewer(email: string) {
  checkRateLimit(`all:admin:${email.toLowerCase()}`, generalLimitPerMinute(), 60_000);
}

/** Wraps a route handler with uniform error handling, and makes the request's headers available to `customer()`. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A) => {
    const run = async () => {
      try {
        if (args[0] instanceof Request) limitClient(args[0].headers); // rate-limit
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
 * `kyc: true` marks a route that needs a verified ID (money out, or money in from the bank; the money-routes map sets it per action). (Enforced by the identity module.)
 * `money: "<action>"` marks a money route: the policy map in money-routes.ts decides its ID gate, and
 * the route then checks the body's `pin` with `requireMpin()` from lib/mpin.
 */
export async function customer(
  opts: { tick?: boolean; access?: "read" | "write"; kyc?: boolean; recovery?: boolean; money?: MoneyAction } = {},
): Promise<User> {
  const kyc = opts.kyc || (opts.money ? moneyPolicy(opts.money).kyc : false); // mpin
  // identity: prototype mode resolves the first user; firebase mode the signed-in person's wallet.
  // `recovery: true` (read routes only) lets a sign-in with provisional recovery access in.
  // rate-limit: session() (inside resolveCustomer) applies the per-person limit in firebase mode.
  const { user } = await resolveCustomer({ access: opts.access, kyc, recovery: opts.recovery });
  if (opts.tick !== false) await tick(user);
  return reload(user);
}

/**
 * mpin: a money action's ID gate, for a route that moves money only on some requests (POST /vaults with an
 * `initialDeposit` takes it from the bank: `vault_deposit`). Call it after reading the body, before anything is
 * written. Routes that always move money use `customer({ money })` instead.
 */
export function moneyGate(user: User, action: MoneyAction) {
  if (moneyPolicy(action).kyc) assertKycGate(user);
}

/**
 * identity: admin routes. Prototype mode is open, as before, and acts as REVIEWER; firebase mode
 * needs a signed-in email from ADMIN_EMAILS and returns it as the reviewer name.
 */
export async function admin(): Promise<string> {
  const email = await requireAdmin();
  if (email) limitReviewer(email); // rate-limit
  return email ?? REVIEWER;
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

/**
 * A `?limit=` query value: a whole number from 1, capped at `max`; `fallback` when it's missing.
 * Anything else is refused with a 400 rather than turned into NaN.
 */
export function limitParam(url: URL, fallback: number, max: number): number {
  const raw = url.searchParams.get("limit");
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = z.coerce.number().int().min(1).safeParse(raw);
  if (!parsed.success) throw new HttpError(400, `limit must be a whole number from 1 to ${max}`, "bad_limit");
  return Math.min(max, parsed.data);
}

/** Converts a major-unit amount from the client into integer minor units. */
export function minor(n: number) {
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, "Amount must be a positive number");
  return Math.round(n * 100);
}

export const REVIEWER = "ops.reviewer@vaultwise";
