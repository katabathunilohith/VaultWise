import { z } from "zod";
import { body, handle, json } from "@/lib/api";
import { assertRecoveryEnabled } from "@/lib/recovery/config";
import { clientKeys, requestHeaders } from "@/lib/auth/context";
import { HttpError } from "@/lib/users";
import { requestReset } from "@/lib/recovery/service";

const Input = z.object({ email: z.string().trim().email().max(200).optional(), findToken: z.string().max(600).optional() });

/**
 * identity: password-reset email (no sign-in). { email } or { findToken } from /recovery/find.
 * Always { ok: true } whether or not the account exists; prototype mode adds simulated: true.
 */
export const POST = handle(async (req: Request) => {
  assertRecoveryEnabled();
  const b = await body(req, Input);
  if (!b.email && !b.findToken) throw new HttpError(400, "Enter your email.", "email_required");
  return json(await requestReset(b, clientKeys(await requestHeaders())));
});
