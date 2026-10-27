import { z } from "zod";
import { body, handle, json } from "@/lib/api";
import { createUser, HttpError } from "@/lib/users";
import { COUNTRY_CODES, MARKET_CODES } from "@/lib/compliance";
import { seedDemo } from "@/lib/seed";
import { newId } from "@/lib/db";
import { session } from "@/lib/auth/session"; // identity
import { bindNewWallet } from "@/lib/auth/account"; // identity
import { kycEnforced } from "@/lib/auth/config"; // identity
import { pendingClaimFor, settleExpiredClaimFor } from "@/lib/recovery/claims"; // identity

const Input = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().email().optional().or(z.literal("")),
  country: z.enum(COUNTRY_CODES).optional(),
  /** Older clients sent a market code; a country is preferred. */
  jurisdiction: z.enum(MARKET_CODES).optional(),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits"),
  demo: z.boolean(),
});

export const maxDuration = 120;

export const POST = handle(async (req: Request) => {
  // identity: prototype → one wallet per server; firebase → one wallet per signed-in person.
  const s = await session();
  if (s.user) {
    if (s.mode === "prototype") throw new HttpError(409, "A wallet already exists — reset the demo first");
    throw new HttpError(409, "You already have a wallet.", "has_wallet");
  }
  // identity: someone waiting on a recovery claim gets that wallet on approval; a second one would clash.
  if (s.token) settleExpiredClaimFor(s.token.uid);
  if (s.token && pendingClaimFor(s.token.uid))
    throw new HttpError(409, "You asked to recover an account. Cancel that request first to open a new wallet.", "claim_pending");
  const b = await body(req, Input);
  // identity: new sign-ups (practice data included) verify an ID first when KYC is enforced.
  const kycStatus = kycEnforced() ? "pending" : "verified";
  if (!b.country && !b.jurisdiction) throw new HttpError(400, "Choose your country");
  const where = { country: b.country, jurisdiction: b.jurisdiction };
  // identity: in firebase mode the email comes from the sign-in token.
  const email = (s.token?.email ?? b.email) || undefined;
  if (b.demo) {
    // identity: with sign-in on, each account gets its own copy of the practice data.
    const user = await seedDemo({ id: s.mode === "firebase" ? newId("usr") : undefined, name: b.name, ...where, pin: b.pin, email, kycStatus });
    if (s.token) bindNewWallet(s.token, user);
  } else {
    const user = createUser({ name: b.name, email, ...where, pin: b.pin, kycStatus });
    if (s.token) bindNewWallet(s.token, user);
  }
  return json({ ok: true });
});
