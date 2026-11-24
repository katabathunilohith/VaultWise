import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { submitPan } from "@/lib/kyc/checks";

export const maxDuration = 30;

/** kyc-checks: step 1. { pan } → the KYC view with `flow` and `steps`. The full PAN is never stored. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ pan: z.string().trim().min(1).max(20) }));
  return json(await submitPan(user, b.pan));
});
