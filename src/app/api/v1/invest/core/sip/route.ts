import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { activeSip, cancelSip, sipNeedsMpin, upsertSip } from "@/lib/invest";
import { mpinField, requireMpin } from "@/lib/mpin"; // mpin
import { HttpError } from "@/lib/users";

/**
 * Configure or modify a recurring Core SIP. Setting one up, or a change that moves more money, needs the MPIN
 * (`invest_sip`, see sipNeedsMpin in lib/invest); lowering it doesn't.
 */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, money: "invest_sip" });
  const b = await body(
    req,
    z.object({ amount: z.number().positive(), frequency: z.enum(["weekly", "monthly"]), startDate: z.string().optional(), pin: mpinField }),
  );
  const startAt = b.startDate ? new Date(b.startDate).getTime() : undefined;
  if (startAt !== undefined && !Number.isFinite(startAt)) throw new HttpError(400, "startDate must be a date, like 2026-12-01", "bad_start_date");
  const amount = minor(b.amount);
  if (sipNeedsMpin(activeSip(user), { amount, frequency: b.frequency, startAt })) requireMpin(user, b.pin, "invest_sip"); // mpin
  upsertSip(user, amount, b.frequency, startAt);
  return json({ ok: true });
});

/** Pause the SIP. No MPIN: it stops money moving. */
export const DELETE = handle(async () => {
  const user = await customer({ tick: false });
  cancelSip(user);
  return json({ ok: true });
});
