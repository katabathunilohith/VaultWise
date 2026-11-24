import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { finishBank } from "@/lib/kyc/checks";

export const maxDuration = 30;

/** kyc-checks: step 3 ends. { requestId } → the KYC view. 409 kyc_step_waiting until the ₹1 payment arrives. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ requestId: z.string().trim().min(1).max(200) }));
  return json(await finishBank(user, b.requestId));
});
