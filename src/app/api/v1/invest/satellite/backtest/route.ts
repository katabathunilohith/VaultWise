import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { backtestMarket } from "@/lib/invest/satellite";

export const maxDuration = 90;

export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ symbol: z.string(), tf: z.enum(["1h", "4h", "1d"]) }));
  return json(await backtestMarket(user, b.symbol, b.tf));
});
