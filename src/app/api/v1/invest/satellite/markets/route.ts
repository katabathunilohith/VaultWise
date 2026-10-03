import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { setMarketEnabled } from "@/lib/invest/satellite";

export const PATCH = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ symbol: z.string(), enabled: z.boolean() }));
  setMarketEnabled(user, b.symbol, b.enabled);
  return json({ ok: true });
});
