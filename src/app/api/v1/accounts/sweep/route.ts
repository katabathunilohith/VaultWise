import { customer, handle, json } from "@/lib/api";
import { sweepRoundups } from "@/lib/vaults";

export const POST = handle(async () => {
  const user = await customer({ tick: false, kyc: true });
  return json(sweepRoundups(user));
});
