import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { currentDevice, revokeDevice } from "@/lib/devices";
import { mpinField, requireMpin } from "@/lib/mpin";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Signs a device out of this account: `{ pin }`. The MPIN is always checked. A device can sign itself
 * out and any untrusted device; signing out a trusted device needs a trusted caller (403
 * `device_untrusted` with `trustableAt`). 404 `device_not_found`. Answers `{ ok: true }`.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await customer({ tick: false, money: "device_revoke" });
  const b = await body(req, z.object({ pin: mpinField }));
  requireMpin(user, b.pin, "device_revoke", { always: true });
  revokeDevice(user, id, await currentDevice(user));
  return json({ ok: true });
});
