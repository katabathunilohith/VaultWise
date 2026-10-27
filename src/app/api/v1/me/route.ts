import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { run } from "@/lib/db";
import { audit } from "@/lib/audit";
import { COUNTRIES, countryInfo, defaultCountryFor, JURISDICTIONS, MARKET_CODES, rulesFor } from "@/lib/compliance";
import { aiEnabled } from "@/lib/groq";
import { checkPin, hashPin, HttpError } from "@/lib/users";
import { parseJson } from "@/lib/db";
import { session } from "@/lib/auth/session"; // identity
import { kycSummary } from "@/lib/kyc/service"; // identity
import { pendingClaimFor } from "@/lib/recovery/claims"; // identity
import { authMode } from "@/lib/auth/config"; // identity
import { maskEmail } from "@/lib/kyc/ids"; // identity
import { latestVerifiedRecord } from "@/lib/kyc/store"; // identity

const markets = () => Object.values(JURISDICTIONS).map((j) => ({ code: j.code, name: j.name, currency: j.currency, flag: j.flag }));
const countries = () => COUNTRIES.map((c) => countryInfo(c.code)!);

export const GET = handle(async () => {
  // identity: prototype → the first user; firebase → the signed-in person's wallet (401 when signed out).
  const s = await session();
  const user = s.user;
  const auth = { mode: s.mode, access: s.access, email: s.mode === "firebase" ? (s.token?.email ?? null) : (user?.email ?? null) };
  if (!user)
    return json({
      onboarded: false,
      aiEnabled: aiEnabled(),
      jurisdictions: markets(),
      countries: countries(),
      auth,
    });
  const rules = rulesFor(user.jurisdiction);
  const claim = s.access === "recovery" && s.token ? pendingClaimFor(s.token.uid) : undefined;
  // identity: while a recovery claim waits, show only a summary: first name, masked email, no risk answers.
  const limited = s.access === "recovery";
  return json({
    onboarded: true,
    auth,
    kyc: kycSummary(user),
    ...(claim ? { recovery: { claimId: claim.id, status: claim.status, createdAt: claim.created_at } } : {}),
    aiEnabled: aiEnabled(),
    user: {
      id: user.id,
      name: limited ? user.name.trim().split(/\s+/)[0] : user.name,
      email: limited ? maskEmail(user.email) : user.email,
      jurisdiction: user.jurisdiction,
      country: countryInfo(user.country ?? defaultCountryFor(user.jurisdiction)),
      currency: user.currency,
      kycStatus: user.kyc_status,
      kycLevel: user.kyc_level,
      plan: user.plan,
      riskProfile: limited ? null : parseJson(user.risk_profile, null),
      satelliteOptIn: !!user.satellite_opt_in,
      createdAt: user.created_at,
    },
    rules,
    jurisdictions: markets(),
    countries: countries(),
  });
});

const Patch = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  email: z.string().email().optional().or(z.literal("")),
  jurisdiction: z.enum(MARKET_CODES).optional(),
  pin: z
    .string()
    .regex(/^\d{4,6}$/, "PIN must be 4–6 digits")
    .optional(),
  /** identity: required with `pin` in firebase mode. */
  currentPin: z.string().max(12).optional(),
});

export const PATCH = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, Patch);
  // A market is tied to KYC and to the wallet's currency: every monetary rule (e.g. the
  // emergency cap) is denominated in it. Moving markets would mean re-verification and a
  // new wallet, so cross-currency switches are refused rather than silently mis-scaling caps.
  if (b.jurisdiction && b.jurisdiction !== user.jurisdiction && rulesFor(b.jurisdiction).currency !== user.currency) {
    throw new HttpError(
      409,
      `Your wallet is in ${user.currency}. Moving to ${rulesFor(b.jurisdiction).name} needs re-verification and a ${rulesFor(b.jurisdiction).currency} wallet — reset the demo to try another market.`,
    );
  }
  // identity: a verified ID was matched against this name, so it can't drift away from the ID afterwards.
  if (b.name && b.name !== user.name && user.kyc_status === "verified" && latestVerifiedRecord(user.id))
    throw new HttpError(403, "Your name matches your verified ID, so it can't be changed here. Contact support to change it.", "name_locked");
  // identity: with sign-in on, a new PIN needs the current one (a stolen session alone can't reset it).
  if (b.pin && authMode() === "firebase" && user.pin_hash) {
    if (!b.currentPin) throw new HttpError(400, "Enter your current PIN.", "current_pin_required");
    if (!checkPin(user, b.currentPin)) throw new HttpError(403, "That PIN isn't right.", "pin_mismatch");
  }
  if (b.name) run("UPDATE users SET name = ? WHERE id = ?", b.name, user.id);
  if (b.email !== undefined) run("UPDATE users SET email = ? WHERE id = ?", b.email || null, user.id);
  if (b.pin) run("UPDATE users SET pin_hash = ? WHERE id = ?", hashPin(b.pin), user.id);
  if (b.jurisdiction && b.jurisdiction !== user.jurisdiction) {
    run("UPDATE users SET jurisdiction = ? WHERE id = ?", b.jurisdiction, user.id);
  }
  audit({
    userId: user.id,
    actor: user.id,
    actorType: "user",
    action: "user.updated",
    entityType: "user",
    entityId: user.id,
    details: { name: b.name, emailChanged: b.email !== undefined, pinChanged: !!b.pin, jurisdiction: b.jurisdiction },
  });
  return json({ ok: true });
});
