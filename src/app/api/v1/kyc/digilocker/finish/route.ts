import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { finishDigiLocker } from "@/lib/kyc/checks";

export const maxDuration = 60;

/** kyc-checks: step 2 ends. { requestId } → the KYC view. 409 kyc_step_waiting until DigiLocker is done. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ requestId: z.string().trim().min(1).max(200) }));
  return json(await finishDigiLocker(user, b.requestId));
});
