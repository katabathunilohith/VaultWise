import { z } from "zod";
import { body, handle, json } from "@/lib/api";
import { currentUser, createUser, HttpError } from "@/lib/users";
import { COUNTRY_CODES, MARKET_CODES } from "@/lib/compliance";
import { seedDemo } from "@/lib/seed";

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
  if (currentUser()) throw new HttpError(409, "A wallet already exists — reset the demo first");
  const b = await body(req, Input);
  if (!b.country && !b.jurisdiction) throw new HttpError(400, "Choose your country");
  const where = { country: b.country, jurisdiction: b.jurisdiction };
  if (b.demo) await seedDemo({ name: b.name, ...where, pin: b.pin, email: b.email || undefined });
  else createUser({ name: b.name, email: b.email || undefined, ...where, pin: b.pin });
  return json({ ok: true });
});
