import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { run } from "@/lib/db";
import { audit } from "@/lib/audit";
import { JURISDICTIONS, rulesFor } from "@/lib/compliance";
import { aiEnabled } from "@/lib/groq";
import { currentUser, hashPin } from "@/lib/users";
import { parseJson } from "@/lib/db";

export const GET = handle(async () => {
  const user = currentUser();
  if (!user)
    return json({
      onboarded: false,
      jurisdictions: Object.values(JURISDICTIONS).map((j) => ({ code: j.code, name: j.name, currency: j.currency, flag: j.flag })),
    });
  const rules = rulesFor(user.jurisdiction);
  return json({
    onboarded: true,
    aiEnabled: aiEnabled(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      jurisdiction: user.jurisdiction,
      currency: user.currency,
      kycStatus: user.kyc_status,
      kycLevel: user.kyc_level,
      plan: user.plan,
      riskProfile: parseJson(user.risk_profile, null),
      satelliteOptIn: !!user.satellite_opt_in,
      createdAt: user.created_at,
    },
    rules,
    jurisdictions: Object.values(JURISDICTIONS).map((j) => ({ code: j.code, name: j.name, currency: j.currency, flag: j.flag })),
  });
});

const Patch = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  email: z.string().email().optional().or(z.literal("")),
  jurisdiction: z.enum(["US", "EU", "UK", "IN", "SG"]).optional(),
  pin: z
    .string()
    .regex(/^\d{4,6}$/, "PIN must be 4–6 digits")
    .optional(),
});

export const PATCH = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, Patch);
  if (b.name) run("UPDATE users SET name = ? WHERE id = ?", b.name, user.id);
  if (b.email !== undefined) run("UPDATE users SET email = ? WHERE id = ?", b.email || null, user.id);
  if (b.pin) run("UPDATE users SET pin_hash = ? WHERE id = ?", hashPin(b.pin), user.id);
  if (b.jurisdiction && b.jurisdiction !== user.jurisdiction) {
    // The wallet currency is fixed at onboarding; switching market changes the rules engine only.
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
