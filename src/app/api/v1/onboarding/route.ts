import { z } from "zod";
import { body, handle, json } from "@/lib/api";
import { currentUser, createUser, HttpError } from "@/lib/users";
import { seedDemo } from "@/lib/seed";

const Input = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().email().optional().or(z.literal("")),
  jurisdiction: z.enum(["US", "EU", "UK", "IN", "SG"]),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits"),
  demo: z.boolean(),
});

export const maxDuration = 120;

export const POST = handle(async (req: Request) => {
  if (currentUser()) throw new HttpError(409, "A wallet already exists — reset the demo first");
  const b = await body(req, Input);
  if (b.demo) await seedDemo({ name: b.name, jurisdiction: b.jurisdiction, pin: b.pin, email: b.email || undefined });
  else createUser({ name: b.name, email: b.email || undefined, jurisdiction: b.jurisdiction, pin: b.pin });
  return json({ ok: true });
});
