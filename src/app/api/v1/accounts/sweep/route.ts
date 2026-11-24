import { customer, handle, json } from "@/lib/api";
import { sweepRoundups } from "@/lib/vaults";

/** Pending round-ups, bank → the round-up vault. Money in: `roundup_sweep`, no MPIN. */
export const POST = handle(async () => {
  const user = await customer({ tick: false, money: "roundup_sweep" }); // mpin: money in
  return json(sweepRoundups(user));
});
